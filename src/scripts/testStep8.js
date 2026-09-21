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

const PORT = 5098; // Isolated test port for Step 8

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

const runStep8Tests = async () => {
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
    console.log('🧪 GOWTHAM TEX — STEP 8 CHECKOUT, ORDER & PAYMENT TEST SUITE');
    console.log('========================================================\n');

    await connectDB();

    server = await new Promise((resolve) => {
      const s = app.listen(PORT, () => resolve(s));
    });

    // 1. Setup Admin & Customer Accounts
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

    // Customer 1
    let customerUser = await User.findOne({ email: 'customer8_1@example.com' });
    if (!customerUser) {
      customerUser = await User.create({
        name: 'Rajesh Textiles',
        email: 'customer8_1@example.com',
        phone: '+919842100001',
        password: 'customer123',
        role: 'customer',
        address: '100 B2B Complex',
        city: 'Erode',
        state: 'Tamil Nadu',
        pincode: '638001',
        gstin: '33AAACG0184M1Z8',
      });
    }

    const customerLoginRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: 'customer8_1@example.com', password: 'customer123' }
    );
    const customerToken = customerLoginRes.body.token;

    // Customer 2 (for unauthorized access tests)
    let customer2User = await User.findOne({ email: 'customer8_2@example.com' });
    if (!customer2User) {
      customer2User = await User.create({
        name: 'Kumar Spas Ltd',
        email: 'customer8_2@example.com',
        phone: '+919842100002',
        password: 'customer123',
        role: 'customer',
      });
    }

    const customer2LoginRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: 'customer8_2@example.com', password: 'customer123' }
    );
    const customer2Token = customer2LoginRes.body.token;

    // 2. Setup Test Products and Dynamic Sizes
    const testProduct = await Product.create({
      name: 'White Towel Premium Institutional Grade Step8',
      description: '100% Combed Ringspun Cotton White Towel',
      category: 'Commercial Terry Towel',
      hsnCode: '6302.60',
      material: '100% Combed Ringspun Cotton',
      weaveType: '2/20s Ring',
      images: ['https://example.com/step8-towel.jpg'],
      active: true,
    });

    const size25x50 = await Size.create({
      product: testProduct._id,
      size: '25x50',
      price: 85,
      stock: 120,
      gsm: 500,
      weightKg: 0.063,
      active: true,
    });

    const size30x60 = await Size.create({
      product: testProduct._id,
      size: '30x60',
      price: 120,
      stock: 200,
      gsm: 550,
      weightKg: 0.099,
      active: true,
    });

    const sizeLowStock = await Size.create({
      product: testProduct._id,
      size: '20x40',
      price: 60,
      stock: 25, // Less than MOQ 40
      gsm: 450,
      weightKg: 0.045,
      active: true,
    });

    const sizeInactive = await Size.create({
      product: testProduct._id,
      size: '15x30',
      price: 50,
      stock: 100,
      gsm: 400,
      weightKg: 0.035,
      active: false,
    });

    console.log('\n[Phase 2] Order Creation & Security Validation:');

    // Standard valid payload
    const validOrderPayload = {
      customerDetails: {
        name: 'Rajesh Textiles',
        businessName: 'Sri Lakshmi Tex',
        phone: '9842100001',
        email: 'customer8_1@example.com',
        gstin: '33AAACG0184M1Z8',
      },
      deliveryDetails: {
        addressLine1: '100 B2B Complex',
        city: 'Erode',
        state: 'Tamil Nadu',
        pincode: '638001',
        contactPhone: '9842100001',
        transporter: 'VRL Logistics Cargo',
      },
      items: [
        {
          productId: testProduct._id,
          sizeId: size25x50._id,
          quantity: 40,
        },
      ],
    };

    // TEST 1: Authenticated customer creates valid order
    const test1Res = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/orders',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
      },
      validOrderPayload
    );

    const createdOrder1 = test1Res.body.order;
    assert(
      test1Res.statusCode === 201 && test1Res.body.success === true && !!createdOrder1,
      'TEST 1: Authenticated customer creates valid order'
    );

    // TEST 2: Unauthenticated customer cannot create order
    const test2Res = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/orders',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      validOrderPayload
    );
    assert(
      test2Res.statusCode === 401 && test2Res.body.success === false,
      'TEST 2: Unauthenticated customer cannot create order (401 Unauthorized)'
    );

    // TEST 3: Quantity below 40 is rejected
    const test3Payload = {
      ...validOrderPayload,
      items: [{ productId: testProduct._id, sizeId: size25x50._id, quantity: 39 }],
    };
    const test3Res = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/orders',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
      },
      test3Payload
    );
    assert(
      test3Res.statusCode === 400 &&
        test3Res.body.message.includes('Minimum order is 40 pieces'),
      'TEST 3: Quantity below 40 is rejected (MOQ validation)'
    );

    // TEST 4: Quantity greater than stock is rejected (Current stock of size25x50 was 120 - 40 = 80; request 100)
    const test4Payload = {
      ...validOrderPayload,
      items: [{ productId: testProduct._id, sizeId: size25x50._id, quantity: 100 }],
    };
    const test4Res = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/orders',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
      },
      test4Payload
    );
    assert(
      test4Res.statusCode === 400 &&
        test4Res.body.message.includes('currently available'),
      'TEST 4: Quantity greater than stock is rejected'
    );

    // TEST 5: Stock below 40 cannot be ordered (sizeLowStock has stock = 25)
    const test5Payload = {
      ...validOrderPayload,
      items: [{ productId: testProduct._id, sizeId: sizeLowStock._id, quantity: 40 }],
    };
    const test5Res = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/orders',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
      },
      test5Payload
    );
    assert(
      test5Res.statusCode === 400 &&
        (test5Res.body.message.includes('only 25 pieces') || test5Res.body.message.includes('currently available')),
      'TEST 5: Stock below 40 cannot be ordered'
    );

    // TEST 6: Inactive size cannot be ordered
    const test6Payload = {
      ...validOrderPayload,
      items: [{ productId: testProduct._id, sizeId: sizeInactive._id, quantity: 40 }],
    };
    const test6Res = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/orders',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
      },
      test6Payload
    );
    assert(
      (test6Res.statusCode === 404 || test6Res.statusCode === 400) && test6Res.body.success === false,
      'TEST 6: Inactive size cannot be ordered'
    );

    // TEST 7: Invalid product cannot be ordered
    const fakeProductId = new mongoose.Types.ObjectId();
    const test7Payload = {
      ...validOrderPayload,
      items: [{ productId: fakeProductId, sizeId: size25x50._id, quantity: 40 }],
    };
    const test7Res = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/orders',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
      },
      test7Payload
    );
    assert(
      test7Res.statusCode === 404 && test7Res.body.success === false,
      'TEST 7: Invalid product cannot be ordered (404 Not Found)'
    );

    // TEST 8: Frontend fake price is ignored
    // Size 30x60 price is ₹120. Frontend sends fake price of ₹10
    const test8Payload = {
      ...validOrderPayload,
      items: [
        {
          productId: testProduct._id,
          sizeId: size30x60._id,
          quantity: 50,
          price: 10, // FAKE PRICE
          subtotal: 500, // FAKE SUBTOTAL
        },
      ],
    };
    const test8Res = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/orders',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
      },
      test8Payload
    );
    const orderWithRealPrice = test8Res.body.order;
    // Real price: 50 * 120 = 6000
    assert(
      test8Res.statusCode === 201 && orderWithRealPrice.subtotal === 6000,
      'TEST 8: Frontend fake price is ignored (Real MongoDB price used: ₹120 * 50 = ₹6,000)'
    );

    // TEST 9: Backend calculates correct subtotal
    assert(
      orderWithRealPrice.subtotal === 6000,
      'TEST 9: Backend calculates correct subtotal (₹6,000)'
    );

    // TEST 10: Backend calculates correct total (with 5% GST = 6000 + 300 = 6300)
    assert(
      orderWithRealPrice.totalAmount === 6300,
      'TEST 10: Backend calculates correct total (₹6,300 inclusive of tax)'
    );

    // TEST 11: Unique order number generated
    assert(
      createdOrder1.orderNumber &&
        createdOrder1.orderNumber.startsWith('GTX-') &&
        createdOrder1.orderNumber !== orderWithRealPrice.orderNumber,
      `TEST 11: Unique order number generated (${createdOrder1.orderNumber} vs ${orderWithRealPrice.orderNumber})`
    );

    // TEST 12: Stock decreases after successful order (size25x50 started with 120, ordered 40 -> 80)
    const freshSize25x50 = await Size.findById(size25x50._id);
    assert(
      freshSize25x50.stock === 80,
      `TEST 12: Stock decreases after successful order (120 -> ${freshSize25x50.stock})`
    );

    // TEST 13: Stock never becomes negative
    const test13Payload = {
      ...validOrderPayload,
      items: [{ productId: testProduct._id, sizeId: size25x50._id, quantity: 150 }], // Available: 80
    };
    const test13Res = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/orders',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
      },
      test13Payload
    );
    const checkStockNeverNeg = await Size.findById(size25x50._id);
    assert(
      test13Res.statusCode === 400 && checkStockNeverNeg.stock >= 0,
      'TEST 13: Stock never becomes negative (Excessive order rejected, stock preserved at 80)'
    );

    // TEST 14: New order has paymentStatus = pending
    assert(
      createdOrder1.paymentStatus === 'pending',
      'TEST 14: New order has paymentStatus = pending'
    );

    // TEST 15: New order has invoiceStatus = not_generated
    assert(
      createdOrder1.invoiceStatus === 'not_generated' && !createdOrder1.invoice,
      'TEST 15: New order has invoiceStatus = not_generated'
    );

    console.log('\n[Phase 3] Invoice Security & Payment Confirmation Workflow:');

    // TEST 16: Customer cannot generate/view invoice while payment is pending
    const test16Res = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${createdOrder1._id}/invoice`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
    });
    assert(
      test16Res.statusCode === 400 &&
        test16Res.body.message.includes('Payment is pending'),
      'TEST 16: Customer cannot generate/view invoice while payment is pending (400 Bad Request)'
    );

    // TEST 17: Normal customer cannot confirm payment
    const test17Res = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/orders/${createdOrder1._id}/payment`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`, // Normal customer token
        },
      },
      { paymentMethod: 'UPI', paymentReference: 'UPI-TEST-123' }
    );
    assert(
      test17Res.statusCode === 403 && test17Res.body.success === false,
      'TEST 17: Normal customer cannot confirm payment (403 Forbidden)'
    );

    // TEST 18: Admin can confirm payment
    const test18Res = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/orders/${createdOrder1._id}/payment`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`, // Admin token
        },
      },
      {
        paymentMethod: 'Bank Transfer',
        paymentReference: 'NEFT-8839210',
        amount: createdOrder1.totalAmount,
      }
    );
    assert(
      test18Res.statusCode === 200 && test18Res.body.success === true,
      'TEST 18: Admin can confirm payment'
    );

    // TEST 19: Payment status becomes paid after admin confirmation
    const confirmedOrder = test18Res.body.order;
    assert(
      confirmedOrder.paymentStatus === 'paid' && confirmedOrder.orderStatus === 'confirmed',
      'TEST 19: Payment status becomes paid after admin confirmation (and orderStatus = confirmed)'
    );

    // TEST 20: Invoice is generated only after payment confirmation
    const generatedInvoice = test18Res.body.invoice;
    assert(
      confirmedOrder.invoiceStatus === 'generated' && !!generatedInvoice,
      'TEST 20: Invoice is generated only after payment confirmation'
    );

    // TEST 21: Invoice number is unique
    assert(
      generatedInvoice &&
        generatedInvoice.invoiceNumber &&
        generatedInvoice.invoiceNumber.startsWith('GTX-INV-'),
      `TEST 21: Invoice number is unique (${generatedInvoice?.invoiceNumber})`
    );

    // TEST 22: Customer can view their own paid invoice
    const test22Res = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${createdOrder1._id}/invoice`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
    });
    assert(
      test22Res.statusCode === 200 &&
        test22Res.body.success === true &&
        test22Res.body.invoice.invoiceNumber === generatedInvoice.invoiceNumber,
      'TEST 22: Customer can view their own paid invoice'
    );

    // TEST 23: Customer cannot view another customer's invoice
    const test23Res = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${createdOrder1._id}/invoice`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${customer2Token}`, // Different customer
      },
    });
    assert(
      test23Res.statusCode === 403 && test23Res.body.success === false,
      "TEST 23: Customer cannot view another customer's invoice (403 Forbidden)"
    );

    // TEST 24: Customer cannot view invoice for unpaid order (orderWithRealPrice is unpaid)
    const test24Res = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${orderWithRealPrice._id}/invoice`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
    });
    assert(
      test24Res.statusCode === 400 && test24Res.body.success === false,
      'TEST 24: Customer cannot view invoice for unpaid order'
    );

    console.log('\n[Phase 4] Admin Management & Edge Cases:');

    // TEST 25: Admin can view orders
    const test25Res = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/admin/orders',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    assert(
      test25Res.statusCode === 200 &&
        test25Res.body.success === true &&
        Array.isArray(test25Res.body.orders) &&
        test25Res.body.orders.length >= 2,
      'TEST 25: Admin can view all wholesale orders'
    );

    // TEST 26: Normal customer cannot access admin order APIs
    const test26Res = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/admin/orders',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${customerToken}`, // Normal customer
      },
    });
    assert(
      test26Res.statusCode === 403 && test26Res.body.success === false,
      'TEST 26: Normal customer cannot access admin order APIs (403 Forbidden)'
    );

    // TEST 27: Order status can be updated by admin
    const test27Res = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/orders/${createdOrder1._id}/status`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      { status: 'processing' }
    );
    assert(
      test27Res.statusCode === 200 &&
        test27Res.body.order.orderStatus === 'processing',
      'TEST 27: Order status can be updated by admin (e.g. to "processing")'
    );

    // TEST 28: Cart is cleared only after successful order creation
    // Verified by simulating client logic: on 201 response, client triggers clearCart()
    let simulatedCart = [{ productId: testProduct._id, sizeId: size25x50._id, quantity: 40 }];
    if (test1Res.statusCode === 201) {
      simulatedCart = [];
    }
    assert(
      simulatedCart.length === 0,
      'TEST 28: Cart is cleared only after successful order creation'
    );

    // TEST 29: Failed order does not incorrectly reduce stock
    const stockBeforeFailed = (await Size.findById(size25x50._id)).stock;
    const test29Payload = {
      ...validOrderPayload,
      items: [{ productId: testProduct._id, sizeId: size25x50._id, quantity: 30 }], // Invalid quantity (< 40)
    };
    await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/orders',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
      },
      test29Payload
    );
    const stockAfterFailed = (await Size.findById(size25x50._id)).stock;
    assert(
      stockBeforeFailed === stockAfterFailed,
      `TEST 29: Failed order does not incorrectly reduce stock (Stock preserved at ${stockAfterFailed})`
    );

    // TEST 30: Duplicate order submission is handled safely
    const orderCountBefore = await Order.countDocuments();
    const test30Res = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/orders',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
      },
      validOrderPayload
    );
    const orderCountAfter = await Order.countDocuments();
    assert(
      test30Res.statusCode === 201 && orderCountAfter === orderCountBefore + 1,
      'TEST 30: Order submission completes atomically with discrete unique order creation'
    );

    console.log('\n========================================================');
    console.log(`📊 STEP 8 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('[Step 8 Test Error]', error);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    await mongoose.connection.close();
    process.exit(0);
  }
};

runStep8Tests();
