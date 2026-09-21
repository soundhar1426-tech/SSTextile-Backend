import mongoose from 'mongoose';
import dotenv from 'dotenv';
import http from 'http';
import app from '../index.js';
import { connectDB } from '../config/db.js';
import { Product } from '../models/Product.js';
import { Size } from '../models/Size.js';
import { User } from '../models/User.js';

dotenv.config();

const PORT = 5097; // Isolated test port

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

const runStep6Tests = async () => {
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
    console.log('🧪 GOWTHAM TEX — STEP 6 CUSTOMER CATALOG & MONGODB TEST SUITE');
    console.log('========================================================\n');

    await connectDB();

    server = await new Promise((resolve) => {
      const s = app.listen(PORT, () => resolve(s));
    });

    // 1. Setup Admin Account & Token for mutating inventory
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

    // 2. Create / Ensure test product with dynamic sizes in MongoDB
    const testProduct = await Product.create({
      name: 'Customer Test Terry Towel',
      description: '100% Combed Ringspun Cotton White Towel',
      category: 'Commercial Terry Towel',
      hsnCode: '6302.60',
      material: '100% Combed Ringspun Cotton',
      weaveType: '2/20s Ring',
      images: ['https://example.com/test-towel.jpg'],
      active: true,
    });

    const size1 = await Size.create({
      product: testProduct._id,
      size: '25x50',
      price: 85,
      stock: 120,
      gsm: 500,
      weightKg: 0.063,
      active: true,
    });

    const size2 = await Size.create({
      product: testProduct._id,
      size: '30x60',
      price: 120,
      stock: 250,
      gsm: 550,
      weightKg: 0.099,
      active: true,
    });

    // TEST 1: Public GET /api/products returns active products without auth
    console.log('[Phase 1] Customer Public Catalog:');
    const getProductsRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/products',
      method: 'GET',
    });

    assert(
      getProductsRes.statusCode === 200 &&
      getProductsRes.body.success === true &&
      Array.isArray(getProductsRes.body.products) &&
      getProductsRes.body.products.length > 0,
      'TEST 1 & 2: Public GET /api/products returns 200 OK without token'
    );

    const foundProd = getProductsRes.body.products.find(
      (p) => p.id.toString() === testProduct._id.toString()
    );

    assert(
      foundProd && foundProd.sizes && foundProd.sizes.length >= 2,
      'TEST 3: Product contains populated active dynamic sizes'
    );

    assert(
      foundProd && foundProd.minPrice === 85 && foundProd.maxPrice === 120 && foundProd.totalStock === 370,
      'TEST 3 (Metrics): Dynamic minPrice, maxPrice, and totalStock computed accurately'
    );

    // TEST 4: Public GET /api/products/:id returns product details
    console.log('\n[Phase 2] Customer Product Details:');
    const getDetailRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/products/${testProduct._id}`,
      method: 'GET',
    });

    assert(
      getDetailRes.statusCode === 200 &&
      getDetailRes.body.success === true &&
      getDetailRes.body.product.name === 'Customer Test Terry Towel',
      'TEST 4: Public GET /api/products/:id returns product details'
    );

    // TEST 5 & 6: Size 25x50 and 30x60 prices and stock
    const detailSizes = getDetailRes.body.product.sizes;
    const s25x50 = detailSizes.find((s) => s.size === '25x50');
    const s30x60 = detailSizes.find((s) => s.size === '30x60');

    assert(
      s25x50 && s25x50.price === 85 && s25x50.stock === 120 && s25x50.dimension === '25x50 cm',
      'TEST 5: Dynamic size "25x50" displays exact price (₹85) and stock (120 pcs)'
    );

    assert(
      s30x60 && s30x60.price === 120 && s30x60.stock === 250 && s30x60.dimension === '30x60 cm',
      'TEST 6: Dynamic size "30x60" displays exact price (₹120) and stock (250 pcs)'
    );

    // TEST 7: Admin adds new size "55x100" (₹220, 75 pcs) -> Customer API immediately reflects it
    console.log('\n[Phase 3] Live Dynamic Inventory Sync:');
    const addSizeRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/products/${testProduct._id}/sizes`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        size: '55x100',
        price: 220,
        stock: 75,
        gsm: 600,
      }
    );

    assert(
      addSizeRes.statusCode === 201 && addSizeRes.body.size.size === '55x100',
      'Admin creates dynamic size "55x100" (₹220, 75 pcs)'
    );
    const size3Id = addSizeRes.body.size._id;

    // Fetch customer product details again
    const syncDetailRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/products/${testProduct._id}`,
      method: 'GET',
    });

    const s55x100 = syncDetailRes.body.product.sizes.find((s) => s.size === '55x100');
    assert(
      s55x100 && s55x100.price === 220 && s55x100.stock === 75,
      'TEST 7 & 8: Customer API automatically reflects new admin size "55x100" at ₹220 with 75 pcs'
    );

    // TEST 8: Admin modifies stock (75 -> 50)
    await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/sizes/${size3Id}`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      { stock: 50 }
    );

    const stockUpdateRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/products/${testProduct._id}`,
      method: 'GET',
    });

    const s55x100Updated = stockUpdateRes.body.product.sizes.find((s) => s.size === '55x100');
    assert(
      s55x100Updated && s55x100Updated.stock === 50,
      'TEST 8: Customer API reflects stock update (50 pcs available)'
    );

    // TEST 9: Admin sets stock to 0 -> Customer API displays status "Out of Stock"
    await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/sizes/${size3Id}`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      { stock: 0 }
    );

    const zeroStockDetailRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/products/${testProduct._id}`,
      method: 'GET',
    });

    const s55x100Zero = zeroStockDetailRes.body.product.sizes.find((s) => s.size === '55x100');
    assert(
      s55x100Zero && s55x100Zero.stock === 0 && s55x100Zero.status === 'Out of Stock',
      'TEST 9: Stock = 0 correctly displays "Out of Stock" status to customer'
    );

    // TEST 10: Admin deactivates size 55x100 -> Customer API no longer returns it
    console.log('\n[Phase 4] Deactivation & Not-Found Handling:');
    await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/admin/sizes/${size3Id}`,
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const deactSizeDetailRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/products/${testProduct._id}`,
      method: 'GET',
    });

    const s55x100Hidden = deactSizeDetailRes.body.product.sizes.find((s) => s.size === '55x100');
    assert(
      !s55x100Hidden,
      'TEST 10: Deactivated size is filtered out from customer product details'
    );

    // TEST 11: Admin deactivates product -> Customer GET /api/products excludes it and GET /api/products/:id returns 404
    await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/admin/products/${testProduct._id}`,
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const getCatalogAfterDeact = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/products',
      method: 'GET',
    });

    const deactProdInCatalog = getCatalogAfterDeact.body.products.find(
      (p) => p.id.toString() === testProduct._id.toString()
    );

    assert(
      !deactProdInCatalog,
      'TEST 11 (Catalog): Deactivated product does not appear in customer catalog'
    );

    const getDeactDetailRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/products/${testProduct._id}`,
      method: 'GET',
    });

    assert(
      getDeactDetailRes.statusCode === 404,
      'TEST 11 (Details): Deactivated product returns 404 Not Found to customer'
    );

    // TEST 12: Invalid Product ID returns 404
    const invalidIdRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/products/invalid-nonexistent-id-12345',
      method: 'GET',
    });

    assert(
      invalidIdRes.statusCode === 404 && invalidIdRes.body.message === 'Product not found',
      'TEST 12: Invalid product ID returns 404 Not Found'
    );

    // TEST 13 & 14: Security check (no sensitive data exposed)
    const samplePublicRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/products',
      method: 'GET',
    });

    const rawPublicJson = JSON.stringify(samplePublicRes.body);
    const hasPassword = rawPublicJson.includes('password') || rawPublicJson.includes('hash');
    const hasJwtSecret = rawPublicJson.includes('JWT_SECRET');

    assert(
      !hasPassword && !hasJwtSecret,
      'TEST 13 & 14 (Security): No sensitive passwords, hashes, or secrets exposed in public APIs'
    );

    console.log('\n========================================================');
    console.log(`📊 STEP 6 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('[Step 6 Test Error]', error);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    await mongoose.connection.close();
    process.exit(0);
  }
};

runStep6Tests();
