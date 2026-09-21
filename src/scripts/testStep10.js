import mongoose from 'mongoose';
import dotenv from 'dotenv';
import http from 'http';
import app from '../index.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Product } from '../models/Product.js';
import { Size } from '../models/Size.js';
import { Order } from '../models/Order.js';
import { OrderItem } from '../models/OrderItem.js';
import { Invoice } from '../models/Invoice.js';
import { Settings } from '../models/Settings.js';

dotenv.config();

const PORT = 5010; // Isolated test port for Step 10

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

export const runStep10Tests = async () => {
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
    console.log('🧪 GOWTHAM TEX — STEP 10 COMPREHENSIVE END-TO-END TEST');
    console.log('========================================================\n');

    await connectDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(PORT, resolve));

    const reqOpts = (path, method = 'GET', token = null) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      return {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers,
      };
    };

    // ----------------------------------------------------
    // SETUP: Clean Database and Seed Actors & Product
    // ----------------------------------------------------
    console.log('[Phase 1] Test Setup: Initializing test catalog and user accounts...');

    // Clear test-specific data
    await User.deleteMany({ email: { $in: ['admin.step10@gowthamtex.com', 'buyerA.step10@test.com', 'buyerB.step10@test.com'] } });
    await Product.deleteMany({ name: 'Step10 Luxury White Bath Towel' });

    // 1. Create Admin
    const adminUser = await User.create({
      name: 'Step10 Mill Admin',
      email: 'admin.step10@gowthamtex.com',
      password: 'admin123password',
      role: 'admin',
      phone: '+919566647825',
      city: 'Erode',
      state: 'Tamil Nadu',
      pincode: '638052',
    });

    await Settings.findOneAndUpdate({}, { hsnCode: '6302.60' });

    // 2. Create Customer A
    const customerA = await User.create({
      name: 'Customer A (Hotel Green Park)',
      businessName: 'Green Park Hotels Pvt Ltd',
      email: 'buyerA.step10@test.com',
      password: 'buyer123password',
      role: 'customer',
      phone: '+919842111111',
      city: 'Coimbatore',
      state: 'Tamil Nadu',
      pincode: '641001',
      gstin: '33AAAAA0000A1Z5',
    });

    // 3. Create Customer B (for cross-tenant authorization tests)
    const customerB = await User.create({
      name: 'Customer B (Resort Bliss)',
      businessName: 'Bliss Resorts & Spa',
      email: 'buyerB.step10@test.com',
      password: 'buyer123password',
      role: 'customer',
      phone: '+919842222222',
      city: 'Ooty',
      state: 'Tamil Nadu',
      pincode: '643001',
    });

    // 4. Create Product & Dynamic Sizes
    const testProduct = await Product.create({
      name: 'Step10 Luxury White Bath Towel',
      description: 'Institutional grade pure white terry towel for end-to-end verification',
      category: 'Commercial Terry Towel',
      material: '100% Combed Ringspun Cotton',
      weaveType: '2/20s Ring',
      hsnCode: '6302.60',
      active: true,
      images: ['https://lh3.googleusercontent.com/aida-public/AB6AXuCCdKqsvfuy2yau3AySGBI8zrrt1U9ghlW3X5wsoSzGBmztb7AyEZEhYV6EL6hsHNIBYMWtdL482GVLBRWvqbV0yTmpIlrmoJph838qaVWq9l1eDuxkE1I__-yKdS3oaLCCRrHpvWejMDeHWnT87rkOyHa0EKZu56Gbw6hoaMcb3hM9wIo5pCxDGGx6g7JtSEJY9wy9ZOXaAhzH4nphAIFBcgFZ6Bb85_5NECSf6XaYsx6x0NyYuSCwXw'],
    });

    // Dynamic sizes: 25x50 (price: 85, stock: 100), 30x60 (price: 120, stock: 250), 40x80 (inactive)
    const size25x50 = await Size.create({
      product: testProduct._id,
      size: '25x50',
      price: 85,
      stock: 100,
      gsm: 500,
      grams: 63,
      weightKg: 0.063,
      active: true,
    });

    const size30x60 = await Size.create({
      product: testProduct._id,
      size: '30x60',
      price: 120,
      stock: 250,
      gsm: 550,
      grams: 99,
      weightKg: 0.099,
      active: true,
    });

    const sizeInactive = await Size.create({
      product: testProduct._id,
      size: '40x80',
      price: 160,
      stock: 50,
      gsm: 600,
      grams: 192,
      weightKg: 0.192,
      active: false,
    });

    console.log('✓ Test actors and catalog initialized.\n');

    // ----------------------------------------------------
    // TEST 1: Admin Authentication
    // ----------------------------------------------------
    console.log('[Test 1] Admin Authentication:');
    const adminLoginRes = await request(
      reqOpts('/api/auth/admin/login', 'POST'),
      { email: 'admin.step10@gowthamtex.com', password: 'admin123password' }
    );
    assert(adminLoginRes.statusCode === 200 && adminLoginRes.body.token, '1.1 Admin login returns 200 OK and JWT token');
    assert(adminLoginRes.body.user?.role === 'admin', '1.2 Admin login confirms role = "admin"');
    const adminToken = adminLoginRes.body.token;

    // Invalid admin credentials
    const adminInvalidLogin = await request(
      reqOpts('/api/auth/admin/login', 'POST'),
      { email: 'admin.step10@gowthamtex.com', password: 'wrongpassword' }
    );
    assert(adminInvalidLogin.statusCode === 401, '1.3 Invalid admin credentials rejected with 401 Unauthorized');

    // ----------------------------------------------------
    // TEST 2: Customer Authentication
    // ----------------------------------------------------
    console.log('\n[Test 2] Customer Authentication:');
    const customerLoginRes = await request(
      reqOpts('/api/auth/login', 'POST'),
      { email: 'buyerA.step10@test.com', password: 'buyer123password' }
    );
    assert(customerLoginRes.statusCode === 200 && customerLoginRes.body.token, '2.1 Customer A login returns 200 OK and JWT token');
    assert(customerLoginRes.body.user?.role === 'customer', '2.2 Customer account role = "customer"');
    const customerAToken = customerLoginRes.body.token;

    const customerBLoginRes = await request(
      reqOpts('/api/auth/login', 'POST'),
      { email: 'buyerB.step10@test.com', password: 'buyer123password' }
    );
    assert(customerBLoginRes.statusCode === 200 && customerBLoginRes.body.token, '2.3 Customer B login succeeds');
    const customerBToken = customerBLoginRes.body.token;

    // Customer registration
    const newCustEmail = `newcustomer.${Date.now()}@test.com`;
    const custRegRes = await request(
      reqOpts('/api/auth/register', 'POST'),
      { name: 'Fresh Customer', email: newCustEmail, phone: '+919999988888', password: 'password123' }
    );
    assert(custRegRes.statusCode === 201 && custRegRes.body.token, '2.4 Customer registration succeeds (201 Created)');

    // ----------------------------------------------------
    // TEST 3 & 4: Product & Dynamic Size Retrieval
    // ----------------------------------------------------
    console.log('\n[Test 3 & 4] Product & Dynamic Size Retrieval:');
    const publicProductsRes = await request(reqOpts('/api/products', 'GET'));
    assert(publicProductsRes.statusCode === 200 && Array.isArray(publicProductsRes.body.products), '3.1 Public GET /api/products returns 200 OK');
    
    const retrievedProd = publicProductsRes.body.products.find((p) => p._id.toString() === testProduct._id.toString() || p.name === testProduct.name);
    assert(!!retrievedProd, '3.2 Created product found in public customer catalog');
    assert(retrievedProd?.sizes?.length === 2, '4.1 Only active dynamic sizes returned (inactive size 40x80 excluded)');

    const size25x50Found = retrievedProd?.sizes?.find((s) => s.size === '25x50');
    assert(size25x50Found?.price === 85 && size25x50Found?.stock === 100, '4.2 Size 25x50 has exact MongoDB price (₹85) and stock (100 pcs)');

    // ----------------------------------------------------
    // TEST 5 & 6: Minimum Order Quantity & Stock Validation
    // ----------------------------------------------------
    console.log('\n[Test 5 & 6] Minimum Order Quantity & Stock Validation:');
    
    // Order 39 pcs (Below MOQ of 40 pcs)
    const moqFailRes = await request(
      reqOpts('/api/orders', 'POST', customerAToken),
      {
        customerDetails: { name: customerA.name, phone: customerA.phone, email: customerA.email },
        deliveryDetails: {
          addressLine1: customerA.address || '123 Test St',
          city: customerA.city || 'Coimbatore',
          state: customerA.state || 'Tamil Nadu',
          pincode: customerA.pincode || '641001',
          contactPhone: customerA.phone,
          transporter: 'VRL Logistics Cargo',
        },
        items: [{ productId: testProduct._id, sizeId: size25x50._id, quantity: 39 }],
      }
    );
    assert(moqFailRes.statusCode === 400, '6.1 Order quantity 39 pieces rejected (400 Bad Request)');
    assert(
      moqFailRes.body.message?.toLowerCase().includes('40') || moqFailRes.body.message?.toLowerCase().includes('minimum'),
      '6.2 Clear MOQ rejection error message returned'
    );

    // Order 101 pcs (Exceeds stock of 100 pcs)
    const stockFailRes = await request(
      reqOpts('/api/orders', 'POST', customerAToken),
      {
        customerDetails: { name: customerA.name, phone: customerA.phone, email: customerA.email },
        deliveryDetails: {
          addressLine1: customerA.address || '123 Test St',
          city: customerA.city || 'Coimbatore',
          state: customerA.state || 'Tamil Nadu',
          pincode: customerA.pincode || '641001',
          contactPhone: customerA.phone,
          transporter: 'VRL Logistics Cargo',
        },
        items: [{ productId: testProduct._id, sizeId: size25x50._id, quantity: 101 }],
      }
    );
    assert(stockFailRes.statusCode === 400, '5.1 Order quantity 101 pieces (exceeding stock 100) rejected with 400');

    // ----------------------------------------------------
    // TEST 7 & 8: Cart/Order Validation & Order Creation
    // ----------------------------------------------------
    console.log('\n[Test 7 & 8] Order Validation & Successful Order Creation:');

    // Missing delivery details
    const missingDeliveryRes = await request(
      reqOpts('/api/orders', 'POST', customerAToken),
      {
        customerDetails: { name: customerA.name, phone: customerA.phone, email: customerA.email },
        deliveryDetails: { addressLine1: '' }, // Missing required city, state, etc.
        items: [{ productId: testProduct._id, sizeId: size25x50._id, quantity: 40 }],
      }
    );
    assert(missingDeliveryRes.statusCode === 400, '7.1 Incomplete delivery details rejected with 400 Bad Request');

    // Valid wholesale order of 40 pieces
    const validOrderRes = await request(
      reqOpts('/api/orders', 'POST', customerAToken),
      {
        customerDetails: {
          name: customerA.name,
          businessName: customerA.businessName,
          phone: customerA.phone,
          email: customerA.email,
          gstin: customerA.gstin,
        },
        deliveryDetails: {
          addressLine1: 'Door 45, Avinashi Main Road',
          city: 'Coimbatore',
          state: 'Tamil Nadu',
          pincode: '641001',
          contactPhone: '+919842111111',
          transporter: 'VRL Logistics Cargo',
        },
        items: [{ productId: testProduct._id, sizeId: size25x50._id, quantity: 40 }],
      }
    );

    assert(validOrderRes.statusCode === 201 && validOrderRes.body.order, '8.1 Order creation for 40 pcs succeeds (201 Created)');
    const createdOrder = validOrderRes.body.order;
    assert(createdOrder.orderNumber && createdOrder.orderNumber.startsWith('GTX-'), '8.2 Unique order number generated (e.g. GTX-XXXXX)');

    // ----------------------------------------------------
    // TEST 9: Initial Order State (Payment Pending & Invoice Not Generated)
    // ----------------------------------------------------
    console.log('\n[Test 9] Initial Order State Verification:');
    assert((createdOrder.paymentStatus || '').toLowerCase() === 'pending', '9.1 Initial paymentStatus is "pending"');
    assert((createdOrder.orderStatus || '').toLowerCase() === 'new', '9.2 Initial orderStatus is "new"');
    assert((createdOrder.invoiceStatus || '').toLowerCase() === 'not_generated', '9.3 Initial invoiceStatus is "not_generated"');

    // Check stock was decremented from 100 to 60
    const updatedSize25x50 = await Size.findById(size25x50._id);
    assert(updatedSize25x50.stock === 60, '5.2 Stock decremented accurately in MongoDB (100 -> 60 pcs)');

    // Customer attempts to get invoice before payment
    const prematureInvoiceRes = await request(
      reqOpts(`/api/orders/${createdOrder._id}/invoice`, 'GET', customerAToken)
    );
    assert(prematureInvoiceRes.statusCode === 400, '9.4 Invoice access before payment rejected with 400 Bad Request');

    // ----------------------------------------------------
    // TEST 10 & 11: Admin Payment Confirmation & Transition to Paid
    // ----------------------------------------------------
    console.log('\n[Test 10 & 11] Admin Payment Confirmation:');
    const paymentConfirmRes = await request(
      reqOpts(`/api/admin/orders/${createdOrder._id}/payment`, 'PATCH', adminToken),
      {
        paymentMethod: 'UPI',
        paymentReference: 'UPI-REF-99887766',
        amount: createdOrder.totalAmount,
      }
    );
    assert(paymentConfirmRes.statusCode === 200 && paymentConfirmRes.body.invoice, '10.1 Admin payment confirmation succeeds (200 OK)');
    const generatedInvoice = paymentConfirmRes.body.invoice;

    assert((paymentConfirmRes.body.order?.paymentStatus || '').toLowerCase() === 'paid', '11.1 Order paymentStatus transitioned to "paid"');
    assert((paymentConfirmRes.body.order?.orderStatus || '').toLowerCase() === 'confirmed', '11.2 Order orderStatus transitioned to "confirmed"');

    // ----------------------------------------------------
    // TEST 12 & 13: Invoice Generation & Duplicate Prevention
    // ----------------------------------------------------
    console.log('\n[Test 12 & 13] Invoice Generation & Duplicate Prevention:');
    assert(generatedInvoice.invoiceNumber && generatedInvoice.invoiceNumber.startsWith('GTX-INV-'), '12.1 Invoice has unique number (GTX-INV-XXXXX)');
    assert(generatedInvoice.hsnCode === '6302.60', '12.2 Invoice contains standard HSN 6302.60');

    // Duplicate confirmation attempt
    const repeatPaymentConfirmRes = await request(
      reqOpts(`/api/admin/orders/${createdOrder._id}/payment`, 'PATCH', adminToken),
      { paymentMethod: 'UPI' }
    );
    assert(repeatPaymentConfirmRes.statusCode === 200, '13.1 Repeated payment confirmation handled safely (200 OK)');
    
    const invoiceCountForOrder = await Invoice.countDocuments({ order: createdOrder._id });
    assert(invoiceCountForOrder === 1, '13.2 Exactly one unique invoice document exists in MongoDB (Duplicate prevented)');

    // ----------------------------------------------------
    // TEST 14: Admin Order Status Updates
    // ----------------------------------------------------
    console.log('\n[Test 14] Admin Order Status Workflow:');
    const statusFlow = ['processing', 'ready_for_dispatch', 'dispatched', 'delivered'];
    let statusSuccess = true;
    for (const st of statusFlow) {
      const stRes = await request(
        reqOpts(`/api/admin/orders/${createdOrder._id}/status`, 'PATCH', adminToken),
        { status: st }
      );
      if (stRes.statusCode !== 200 || stRes.body.order?.orderStatus !== st) {
        statusSuccess = false;
      }
    }
    assert(statusSuccess, '14.1 Admin successfully updated order status through full lifecycle (Processing -> Ready -> Dispatched -> Delivered)');

    // ----------------------------------------------------
    // TEST 15: Customer Order Visibility
    // ----------------------------------------------------
    console.log('\n[Test 15] Customer Order Visibility:');
    const customerOrdersRes = await request(reqOpts('/api/orders', 'GET', customerAToken));
    assert(customerOrdersRes.statusCode === 200 && customerOrdersRes.body.orders?.length >= 1, '15.1 Customer A can view their order list');
    
    const custOrder = customerOrdersRes.body.orders.find((o) => o._id.toString() === createdOrder._id.toString());
    assert(custOrder?.orderStatus === 'delivered', '15.2 Customer sees live updated order status ("delivered")');
    assert((custOrder?.paymentStatus || '').toLowerCase() === 'paid', '15.3 Customer sees updated payment status ("paid")');

    const customerInvoiceRes = await request(
      reqOpts(`/api/orders/${createdOrder._id}/invoice`, 'GET', customerAToken)
    );
    assert(customerInvoiceRes.statusCode === 200 && customerInvoiceRes.body.invoice, '15.4 Customer A can retrieve their final GST tax invoice');

    // ----------------------------------------------------
    // TEST 16: Order Ownership Security (Multi-Tenant Isolation)
    // ----------------------------------------------------
    console.log('\n[Test 16] Order Ownership Security:');
    // Customer B attempts to access Customer A's order
    const custBCrossOrderRes = await request(
      reqOpts(`/api/orders/${createdOrder._id}`, 'GET', customerBToken)
    );
    assert(custBCrossOrderRes.statusCode === 403 || custBCrossOrderRes.statusCode === 404, '16.1 Customer B accessing Customer A order is rejected (403 Forbidden / 404)');

    // Customer B attempts to access Customer A's invoice
    const custBCrossInvoiceRes = await request(
      reqOpts(`/api/orders/${createdOrder._id}/invoice`, 'GET', customerBToken)
    );
    assert(custBCrossInvoiceRes.statusCode === 403 || custBCrossInvoiceRes.statusCode === 404, '16.2 Customer B accessing Customer A invoice is rejected (403 Forbidden / 404)');

    // ----------------------------------------------------
    // TEST 17: Admin Authorization (Customer Accessing Admin APIs)
    // ----------------------------------------------------
    console.log('\n[Test 17] Admin Authorization Security:');
    const custOnAdminOrders = await request(reqOpts('/api/admin/orders', 'GET', customerAToken));
    assert(custOnAdminOrders.statusCode === 403, '17.1 Customer accessing /api/admin/orders rejected with 403 Forbidden');

    const custOnAdminVerify = await request(reqOpts('/api/admin/verify', 'GET', customerAToken));
    assert(custOnAdminVerify.statusCode === 403, '17.2 Customer accessing /api/admin/verify rejected with 403 Forbidden');

    const custConfirmPayRes = await request(
      reqOpts(`/api/admin/orders/${createdOrder._id}/payment`, 'PATCH', customerAToken),
      { paymentMethod: 'Cash' }
    );
    assert(custConfirmPayRes.statusCode === 403, '17.3 Customer attempting payment confirmation rejected with 403 Forbidden');

    // ----------------------------------------------------
    // TEST 18: Customer Authentication Requirement
    // ----------------------------------------------------
    console.log('\n[Test 18] Customer Authentication Requirement:');
    const unauthOrdersRes = await request(reqOpts('/api/orders', 'GET'));
    assert(unauthOrdersRes.statusCode === 401, '18.1 Unauthenticated request to /api/orders rejected with 401 Unauthorized');

    const unauthCreateOrderRes = await request(
      reqOpts('/api/orders', 'POST'),
      { items: [{ productId: testProduct._id, sizeId: size25x50._id, quantity: 40 }] }
    );
    assert(unauthCreateOrderRes.statusCode === 401, '18.2 Unauthenticated order creation rejected with 401 Unauthorized');

    // ----------------------------------------------------
    // TEST 19: Sensitive Data Protection
    // ----------------------------------------------------
    console.log('\n[Test 19] Sensitive Data Protection:');
    const allResponses = [adminLoginRes, customerLoginRes, customerOrdersRes, publicProductsRes];
    let sensitiveExposed = false;
    for (const r of allResponses) {
      const str = JSON.stringify(r.body || {});
      if (str.includes('$2a$') || str.includes('$2b$') || str.includes('passwordHash') || str.includes('JWT_SECRET')) {
        sensitiveExposed = true;
      }
    }
    assert(!sensitiveExposed, '19.1 Password hashes and server secrets are never exposed in JSON responses');

    // ----------------------------------------------------
    // SUMMARY
    // ----------------------------------------------------
    console.log('\n========================================================');
    console.log(`📊 STEP 10 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================\n');

    return { passed, failed };
  } catch (error) {
    console.error('❌ Step 10 Test Runner Error:', error);
    throw error;
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
};

// Run directly if invoked from command line
if (process.argv[1] && process.argv[1].endsWith('testStep10.js')) {
  runStep10Tests()
    .then(({ failed }) => {
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
