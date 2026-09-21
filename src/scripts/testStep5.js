import mongoose from 'mongoose';
import dotenv from 'dotenv';
import http from 'http';
import app from '../index.js';
import { connectDB } from '../config/db.js';
import { Product } from '../models/Product.js';
import { Size } from '../models/Size.js';
import { User } from '../models/User.js';

dotenv.config();

const PORT = 5098; // Isolated test port

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

const runStep5Tests = async () => {
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
    console.log('🧪 GOWTHAM TEX — STEP 5 ADMIN PRODUCT & DYNAMIC SIZE TEST SUITE');
    console.log('========================================================\n');

    await connectDB();

    server = await new Promise((resolve) => {
      const s = app.listen(PORT, () => resolve(s));
    });

    // Setup accounts
    let adminToken = '';
    let customerToken = '';

    // Create / ensure admin
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

    // Create / ensure test customer
    const testCustomerEmail = `test_customer_${Date.now()}@buyer.com`;
    const customerUser = await User.create({
      name: 'Test Wholesale Buyer',
      email: testCustomerEmail,
      phone: '+919842100000',
      password: 'customer123',
      role: 'customer',
    });

    // TEST 1: Admin Login
    console.log('[Phase 1] Admin Authentication:');
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
    assert(
      adminLoginRes.statusCode === 200 && adminLoginRes.body.token,
      'TEST 1: Admin login succeeds and returns JWT token'
    );
    adminToken = adminLoginRes.body.token;

    // Get customer token for authorization testing
    const custLoginRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: testCustomerEmail, password: 'customer123' }
    );
    customerToken = custLoginRes.body.token;

    // TEST 2: Create Product
    console.log('\n[Phase 2] Admin Product CRUD:');
    const createProdRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/admin/products',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        name: 'White Towel Luxury Terry',
        description: 'Institutional Grade Combed Cotton White Towel',
        category: 'Commercial Terry Towel',
        hsnCode: '6302.60',
        material: '100% Combed Ringspun Cotton',
        weaveType: '2/20s Ring',
        images: ['https://example.com/towel.jpg'],
      }
    );

    assert(
      createProdRes.statusCode === 201 && createProdRes.body.product?._id,
      'TEST 2: Admin creates product in MongoDB',
      JSON.stringify(createProdRes.body)
    );
    const createdProductId = createProdRes.body.product._id;

    // TEST 3: Edit Product
    const editProdRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/products/${createdProductId}`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        name: 'White Towel Premium Institutional Grade',
        description: 'Updated description with high absorbency',
      }
    );

    assert(
      editProdRes.statusCode === 200 && editProdRes.body.product.name.includes('Institutional Grade'),
      'TEST 3: Admin edits product details successfully'
    );

    // TEST 4: Add Size (25x50 -> ₹80 -> 100 pcs)
    console.log('\n[Phase 3] Dynamic Size Management:');
    const addSize1Res = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/products/${createdProductId}/sizes`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        size: '25x50',
        price: 80,
        stock: 100,
        gsm: 500,
        weightKg: 0.063,
      }
    );

    assert(
      addSize1Res.statusCode === 201 && addSize1Res.body.size.size === '25x50' && addSize1Res.body.size.price === 80,
      'TEST 4: Add dynamic size "25x50" (Price: ₹80, Stock: 100)'
    );
    const size1Id = addSize1Res.body.size._id;

    // TEST 5: Add Another Size (30x60 -> ₹120 -> 250 pcs)
    const addSize2Res = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/products/${createdProductId}/sizes`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        size: '30x60',
        price: 120,
        stock: 250,
        gsm: 550,
        weightKg: 0.099,
      }
    );

    assert(
      addSize2Res.statusCode === 201 && addSize2Res.body.size.size === '30x60' && addSize2Res.body.size.price === 120,
      'TEST 5: Add second dynamic size "30x60" (Price: ₹120, Stock: 250)'
    );
    const size2Id = addSize2Res.body.size._id;

    // TEST 6: Attempt Duplicate Size ("25x50")
    const dupSizeRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/products/${createdProductId}/sizes`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        size: '25x50',
        price: 90,
        stock: 50,
      }
    );

    assert(
      dupSizeRes.statusCode === 400 && dupSizeRes.body.message.includes('already exists'),
      'TEST 6: Duplicate active size "25x50" rejected with clear error',
      JSON.stringify(dupSizeRes.body)
    );

    // TEST 7: Edit Price (₹80 -> ₹85)
    console.log('\n[Phase 4] Size Price & Stock Editing:');
    const editPriceRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/sizes/${size1Id}`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        price: 85,
      }
    );

    assert(
      editPriceRes.statusCode === 200 && editPriceRes.body.size.price === 85,
      'TEST 7: Edit price from ₹80 to ₹85 verified in DB'
    );

    // TEST 8: Edit Stock (100 -> 120)
    const editStockRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/sizes/${size1Id}`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        stock: 120,
      }
    );

    assert(
      editStockRes.statusCode === 200 && editStockRes.body.size.stock === 120,
      'TEST 8: Edit stock from 100 to 120 verified in DB'
    );

    // TEST 9: Set Stock to 0 -> Status is "Out of Stock"
    const zeroStockRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/sizes/${size1Id}`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        stock: 0,
      }
    );

    assert(
      zeroStockRes.statusCode === 200 && zeroStockRes.body.size.stock === 0 && zeroStockRes.body.size.status === 'Out of Stock',
      'TEST 9: Stock 0 correctly displays "Out of Stock" status'
    );

    // Restore stock to 100 for inventory summary tests
    await Size.findByIdAndUpdate(size1Id, { stock: 100 });

    // TEST 10: Try Negative Stock
    const negStockRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/sizes/${size1Id}`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        stock: -50,
      }
    );

    assert(
      negStockRes.statusCode === 400 && negStockRes.body.success === false,
      'TEST 10: Negative stock rejected with 400 Bad Request'
    );

    // TEST 11: Customer Token Attempts Admin API -> 403 Forbidden
    console.log('\n[Phase 5] Admin Authorization Security:');
    const custAttemptRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/admin/products',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
      },
      { name: 'Hacker Towel' }
    );

    assert(
      custAttemptRes.statusCode === 403,
      'TEST 11: Customer token on admin product API receives 403 Forbidden'
    );

    // TEST 12: No Token Attempts Admin API -> 401 Unauthorized
    const noTokenRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/admin/products',
      method: 'GET',
    });

    assert(
      noTokenRes.statusCode === 401,
      'TEST 12: Missing token on admin API receives 401 Unauthorized'
    );

    // TEST 13: Deactivate Size
    console.log('\n[Phase 6] Deactivation & Data Persistence:');
    const delSizeRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/admin/sizes/${size2Id}`,
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert(
      delSizeRes.statusCode === 200 && delSizeRes.body.success === true,
      'TEST 13: Deactivate size (active: false) succeeds'
    );

    const checkSizeDoc = await Size.findById(size2Id);
    assert(
      checkSizeDoc && checkSizeDoc.active === false,
      'TEST 13 (Verify): Size in database has active = false'
    );

    // TEST 14: Re-query from MongoDB to ensure data integrity
    const getProductListRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/admin/products/${createdProductId}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert(
      getProductListRes.statusCode === 200 &&
      getProductListRes.body.product.sizes.length === 1 &&
      getProductListRes.body.product.sizes[0].size === '25x50',
      'TEST 14: Re-queried product from MongoDB only returns active sizes'
    );

    // Verify Inventory Summary API
    const summaryRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/admin/products/inventory/summary',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert(
      summaryRes.statusCode === 200 && summaryRes.body.summary.totalProducts >= 1,
      'TEST 14 (Summary): Inventory summary accurately aggregates real MongoDB metrics'
    );

    console.log('\n========================================================');
    console.log(`📊 STEP 5 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('[Step 5 Test Error]', error);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    await mongoose.connection.close();
    process.exit(0);
  }
};

runStep5Tests();
