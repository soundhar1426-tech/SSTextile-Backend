import mongoose from 'mongoose';
import dotenv from 'dotenv';
import http from 'http';
import app from '../index.js';
import { connectDB } from '../config/db.js';
import { Product } from '../models/Product.js';
import { Size } from '../models/Size.js';
import { User } from '../models/User.js';
import { Order } from '../models/Order.js';
import { OrderItem } from '../models/OrderItem.js';
import { Invoice } from '../models/Invoice.js';

dotenv.config();

const PORT = 5099; // Isolated test port for Step 9

// Helper to make HTTP requests
const request = (options, postData = null) => {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch (e) {
          parsed = body;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed,
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
};

const runStep9Tests = async () => {
  let server;
  let passed = 0;
  let failed = 0;

  const assert = (condition, testName, details = '') => {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${details ? `(${details})` : ''}`);
      failed++;
    }
  };

  try {
    console.log('\n========================================================');
    console.log('🧪 GOWTHAM TEX — STEP 9 ADMIN ORDER MANAGEMENT TEST SUITE');
    console.log('========================================================\n');

    await connectDB();

    server = await new Promise((resolve) => {
      const s = app.listen(PORT, () => resolve(s));
    });

    // 1. Setup Test Accounts & Products
    console.log('[Phase 1] Test Setup & Authentication:');

    // Admin user
    let adminUser = await User.findOne({ email: 'admin@gowthamtex.com' });
    if (!adminUser) {
      adminUser = await User.create({
        name: 'Gowtham Tex Admin',
        email: 'admin@gowthamtex.com',
        phone: '+919842712345',
        password: 'admin123',
        role: 'admin',
      });
    }

    const adminLoginRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/admin/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: 'admin@gowthamtex.com', password: 'admin123' }
    );
    const adminToken = adminLoginRes.body.token;

    // Customer A
    let customerA = await User.findOne({ email: 'buyer9_a@example.com' });
    if (!customerA) {
      customerA = await User.create({
        name: 'K. Rajendran',
        companyName: 'Surya Grand Hotel',
        email: 'buyer9_a@example.com',
        phone: '+919842155670',
        password: 'customer123',
        role: 'customer',
        address: '500 Avinashi Road',
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        pincode: '641018',
        gstin: '33AAACG0184M1Z8',
      });
    }

    const customerALoginRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: 'buyer9_a@example.com', password: 'customer123' }
    );
    const customerAToken = customerALoginRes.body.token;

    // Customer B (Different buyer for cross-account security testing)
    let customerB = await User.findOne({ email: 'buyer9_b@example.com' });
    if (!customerB) {
      customerB = await User.create({
        name: 'M. Selvam',
        companyName: 'Selvam Spas Ltd',
        email: 'buyer9_b@example.com',
        phone: '+919842199880',
        password: 'customer123',
        role: 'customer',
        address: '22 Brough Road',
        city: 'Erode',
        state: 'Tamil Nadu',
        pincode: '638001',
      });
    }

    const customerBLoginRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: 'buyer9_b@example.com', password: 'customer123' }
    );
    const customerBToken = customerBLoginRes.body.token;

    // Setup Test Product & Sizes
    let testProduct = await Product.findOne({ title: 'Step 9 Verification White Towel' });
    if (!testProduct) {
      testProduct = await Product.create({
        title: 'Step 9 Verification White Towel',
        name: 'Step 9 Verification White Towel',
        description: 'Commercial 100% Cotton Towel for Step 9 Testing',
        category: 'White Towels',
        material: '100% Combed Ringspun Cotton',
        weaveType: '2/20s Ring Spun',
        gsmRange: '500 - 650 GSM',
        active: true,
      });
    }

    let sizeA = await Size.create({
      product: testProduct._id,
      size: '30x60',
      widthCm: 30,
      lengthCm: 60,
      gsm: 500,
      grams: 90,
      weightKg: 0.09,
      price: 100,
      stock: 500,
      active: true,
    });

    let sizeB = await Size.create({
      product: testProduct._id,
      size: '70x140',
      widthCm: 70,
      lengthCm: 140,
      gsm: 600,
      grams: 450,
      weightKg: 0.45,
      price: 250,
      stock: 300,
      active: true,
    });

    testProduct.sizes = [sizeA._id, sizeB._id];
    await testProduct.save();

    console.log('✓ Test actors & catalog created.\n');

    // Phase 2: Create Wholesale Order by Customer A
    console.log('[Phase 2] Order Creation & Initial State Verification:');

    const orderPayload = {
      items: [
        {
          productId: testProduct._id.toString(),
          sizeId: sizeA._id.toString(),
          size: '30x60',
          quantity: 50,
          price: 100,
        },
      ],
      deliveryDetails: {
        addressLine1: '500 Avinashi Road',
        addressLine2: 'Suite 4B',
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        pincode: '641018',
        contactPhone: '+919842155670',
        transporter: 'VRL Logistics Cargo Express',
      },
      customerDetails: {
        name: 'K. Rajendran',
        businessName: 'Surya Grand Hotel',
        phone: '+919842155670',
        email: 'buyer9_a@example.com',
        gstin: '33AAACG0184M1Z8',
      },
    };

    const createOrderRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/orders',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerAToken}`,
        },
      },
      orderPayload
    );

    assert(createOrderRes.statusCode === 201 && createOrderRes.body.success, 'TEST: Customer A successfully creates wholesale order');
    const orderA = createOrderRes.body.order;

    // Test 7: New order has paymentStatus = pending
    assert(
      (orderA.paymentStatus || '').toLowerCase() === 'pending',
      'TEST 7: New order has payment pending (paymentStatus = "pending")',
      `Got: ${orderA.paymentStatus}`
    );

    // Test 13: Proforma Invoice available before payment for bank remittance
    const pendingInvoiceRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${orderA._id}/invoice`,
      method: 'GET',
      headers: { Authorization: `Bearer ${customerAToken}` },
    });
    assert(
      pendingInvoiceRes.statusCode === 200 && (pendingInvoiceRes.body.invoice?.isDraft === true || pendingInvoiceRes.body.invoice?.paymentStatus === 'pending'),
      'TEST 13: Proforma bill is available with mill bank details while payment is pending',
      `Status: ${pendingInvoiceRes.statusCode}`
    );

    console.log('\n[Phase 3] Security & Authorization Verification:');

    // Test 1: Admin can retrieve orders
    const adminOrdersRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/admin/orders',
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      adminOrdersRes.statusCode === 200 && adminOrdersRes.body.success && Array.isArray(adminOrdersRes.body.orders),
      'TEST 1: Admin can retrieve wholesale orders (200 OK)',
      `Status: ${adminOrdersRes.statusCode}`
    );

    // Test 2: Customer cannot access admin orders
    const customerAdminOrdersRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/admin/orders',
      method: 'GET',
      headers: { Authorization: `Bearer ${customerAToken}` },
    });
    assert(
      customerAdminOrdersRes.statusCode === 403,
      'TEST 2: Customer cannot access admin orders (403 Forbidden)',
      `Status: ${customerAdminOrdersRes.statusCode}`
    );

    // Test 3: Unauthenticated user cannot access admin orders
    const unauthAdminOrdersRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/admin/orders',
      method: 'GET',
    });
    assert(
      unauthAdminOrdersRes.statusCode === 401,
      'TEST 3: Unauthenticated user cannot access admin orders (401 Unauthorized)',
      `Status: ${unauthAdminOrdersRes.statusCode}`
    );

    // Test 4: Admin can view order details
    const adminOrderDetailRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/admin/orders/${orderA._id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      adminOrderDetailRes.statusCode === 200 && adminOrderDetailRes.body.order?._id === orderA._id,
      'TEST 4: Admin can view specific order details',
      `Status: ${adminOrderDetailRes.statusCode}`
    );

    // Test 5: Customer can view own order
    const customerOwnOrderRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${orderA._id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${customerAToken}` },
    });
    assert(
      customerOwnOrderRes.statusCode === 200 && customerOwnOrderRes.body.order?._id === orderA._id,
      'TEST 5: Customer can view own order details',
      `Status: ${customerOwnOrderRes.statusCode}`
    );

    // Test 6: Customer cannot view another customer's order
    const crossCustomerOrderRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${orderA._id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${customerBToken}` },
    });
    assert(
      crossCustomerOrderRes.statusCode === 403,
      'TEST 6: Customer cannot view another customer\'s order (403 Forbidden)',
      `Status: ${crossCustomerOrderRes.statusCode}`
    );

    // Test 9: Customer cannot confirm payment
    const customerConfirmPaymentRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/orders/${orderA._id}/payment`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerAToken}`,
        },
      },
      { paymentMethod: 'UPI', paymentReference: 'FAKE-REF' }
    );
    assert(
      customerConfirmPaymentRes.statusCode === 403,
      'TEST 9: Customer cannot confirm payment (403 Forbidden)',
      `Status: ${customerConfirmPaymentRes.statusCode}`
    );

    // Test 22: Customer cannot access admin APIs
    const customerAdminPatchRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/orders/${orderA._id}/status`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerAToken}`,
        },
      },
      { status: 'confirmed' }
    );
    assert(
      customerAdminPatchRes.statusCode === 403,
      'TEST 22: Customer cannot access admin status update APIs (403 Forbidden)',
      `Status: ${customerAdminPatchRes.statusCode}`
    );

    console.log('\n[Phase 4] Payment Confirmation & Invoice Generation Workflow:');

    // Test 8: Admin can confirm payment
    const confirmPaymentRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/orders/${orderA._id}/payment`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        paymentMethod: 'Bank Transfer',
        paymentReference: 'UTR-9923847291',
        amount: orderA.totalAmount,
      }
    );
    assert(
      confirmPaymentRes.statusCode === 200 && confirmPaymentRes.body.success,
      'TEST 8: Admin can confirm payment received',
      `Status: ${confirmPaymentRes.statusCode}`
    );

    const updatedOrderAfterPayment = confirmPaymentRes.body.order;

    // Test 10: Payment changes to paid
    assert(
      (updatedOrderAfterPayment.paymentStatus || '').toLowerCase() === 'paid',
      'TEST 10: Payment status transitions to "paid"',
      `Got: ${updatedOrderAfterPayment.paymentStatus}`
    );

    // Test 11: Payment confirmation records admin
    const paymentConfirmedBy = updatedOrderAfterPayment.paymentDetails?.confirmedBy;
    assert(
      paymentConfirmedBy && paymentConfirmedBy.toString() === adminUser._id.toString(),
      'TEST 11: Payment confirmation records admin ID accurately',
      `ConfirmedBy: ${paymentConfirmedBy}`
    );

    // Test 12: Invoice generated after payment
    const invoiceDoc = confirmPaymentRes.body.invoice;
    assert(
      invoiceDoc && invoiceDoc.invoiceNumber && updatedOrderAfterPayment.invoiceStatus === 'generated',
      'TEST 12: Unique final GST Invoice generated after payment confirmation',
      `Invoice #: ${invoiceDoc?.invoiceNumber}`
    );

    // Test 14 & 15: Duplicate payment confirmation is rejected safely
    const duplicateConfirmRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/orders/${orderA._id}/payment`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        paymentMethod: 'UPI',
        paymentReference: 'DUP-1234',
      }
    );
    assert(
      duplicateConfirmRes.statusCode === 200 &&
        duplicateConfirmRes.body.invoice?._id.toString() === invoiceDoc._id.toString(),
      'TEST 14 & 15: Duplicate payment confirmation is handled safely without duplicate invoice creation',
      `Invoice returned: ${duplicateConfirmRes.body.invoice?.invoiceNumber}`
    );

    // Verify invoice count in DB for this order is exactly 1
    const invoiceCount = await Invoice.countDocuments({ order: orderA._id });
    assert(
      invoiceCount === 1,
      'TEST 15 (DB Count): Exactly 1 invoice document exists in MongoDB for this order',
      `Count: ${invoiceCount}`
    );

    console.log('\n[Phase 5] Order Status Transitions & Customer Visibility:');

    // Test 16: Admin can update order status
    const statusProgression = ['confirmed', 'processing', 'ready_for_dispatch', 'dispatched', 'delivered'];
    let allStatusesPassed = true;

    for (const nextStatus of statusProgression) {
      const updateStatusRes = await request(
        {
          hostname: '127.0.0.1',
          port: PORT,
          path: `/api/admin/orders/${orderA._id}/status`,
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
        },
        { status: nextStatus, transporter: 'VRL Logistics Cargo Express' }
      );

      if (updateStatusRes.statusCode !== 200 || updateStatusRes.body.order.orderStatus !== nextStatus) {
        allStatusesPassed = false;
        break;
      }
    }
    assert(
      allStatusesPassed,
      'TEST 16: Admin can update order status sequentially (Confirmed -> Processing -> Ready for Dispatch -> Dispatched -> Delivered)'
    );

    // Test 17: Invalid status is rejected
    const invalidStatusRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/orders/${orderA._id}/status`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      { status: 'INVALID_STATUS_TEST' }
    );
    assert(
      invalidStatusRes.statusCode === 400,
      'TEST 17: Invalid status is rejected with 400 Bad Request',
      `Status: ${invalidStatusRes.statusCode}`
    );

    // Test 18: Customer sees updated status
    const customerStatusCheckRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${orderA._id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${customerAToken}` },
    });
    assert(
      customerStatusCheckRes.statusCode === 200 && customerStatusCheckRes.body.order.orderStatus === 'delivered',
      'TEST 18: Customer sees real-time updated order status ("delivered")',
      `Customer Saw: ${customerStatusCheckRes.body.order?.orderStatus}`
    );

    console.log('\n[Phase 6] Search, Filtering & Data Integrity:');

    // Test 19: Search works
    const searchByOrderNumRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/admin/orders?search=${encodeURIComponent(orderA.orderNumber)}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const searchByPhoneRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/admin/orders?search=9842155670`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      searchByOrderNumRes.statusCode === 200 &&
        searchByOrderNumRes.body.orders.length >= 1 &&
        searchByPhoneRes.statusCode === 200 &&
        searchByPhoneRes.body.orders.length >= 1,
      'TEST 19: Admin search by order number and phone number works accurately'
    );

    // Test 20: Filters work (status, paymentStatus, invoiceStatus)
    const filterPaidRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/admin/orders?paymentStatus=paid&invoiceStatus=generated`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      filterPaidRes.statusCode === 200 &&
        filterPaidRes.body.orders.every(
          (o) => (o.paymentStatus || '').toLowerCase() === 'paid' && o.invoiceStatus === 'generated'
        ),
      'TEST 20: Filters for paymentStatus=paid and invoiceStatus=generated work accurately'
    );

    // Test 21: Sensitive information is not exposed
    const customerOrderJson = JSON.stringify(customerStatusCheckRes.body);
    const hasPasswordHash = customerOrderJson.includes('password') && customerOrderJson.includes('$2');
    assert(
      !hasPasswordHash,
      'TEST 21: Sensitive password hashes and secrets are never exposed in order APIs'
    );

    // Cleanup Step 9 test artifacts cleanly
    await OrderItem.deleteMany({ order: orderA._id });
    await Invoice.deleteMany({ order: orderA._id });
    await Order.findByIdAndDelete(orderA._id);
    await Size.deleteMany({ product: testProduct._id });
    await Product.findByIdAndDelete(testProduct._id);
    await User.findByIdAndDelete(customerA._id);
    await User.findByIdAndDelete(customerB._id);

    console.log('\n========================================================');
    console.log(`📊 STEP 9 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================\n');
  } catch (err) {
    console.error('Fatal test error in Step 9 test suite:', err);
    failed++;
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
};

runStep9Tests();
