import mongoose from 'mongoose';
import dotenv from 'dotenv';
import http from 'http';
import app from '../index.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';

dotenv.config();

const PORT = 5099; // Isolated test port

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

const runAuthTests = async () => {
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
    console.log('🧪 GOWTHAM TEX — STEP 4 AUTH & AUTHORIZATION TEST SUITE');
    console.log('========================================================\n');

    await connectDB();

    // Start isolated test server
    server = await new Promise((resolve) => {
      const s = app.listen(PORT, () => resolve(s));
    });

    const uniqueId = Date.now();
    const testCustomerEmail = `buyer_${uniqueId}@testtextile.com`;
    const testAdminEmail = 'admin@gowthamtex.com';
    let customerToken = '';
    let adminToken = '';

    // TEST 1: Customer Registration Success
    console.log('[Phase 1] Customer Registration Tests:');
    const regRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        name: 'Vignesh Textiles',
        email: testCustomerEmail,
        phone: '+91 98427 99999',
        password: 'securePassword123',
        address: '54 Bazaar St',
        city: 'Erode',
        state: 'Tamil Nadu',
        pincode: '638001',
        gstin: '33AAACB1234F1Z5',
      }
    );

    assert(
      regRes.statusCode === 201 && regRes.body.success === true && regRes.body.token,
      'Customer Registration returns 201 and JWT token',
      JSON.stringify(regRes.body)
    );
    assert(
      regRes.body.user && regRes.body.user.role === 'customer',
      'Newly registered user automatically receives role="customer"'
    );
    assert(
      !regRes.body.user?.password,
      'Password hash is NOT exposed in registration response'
    );
    customerToken = regRes.body.token;

    // TEST 2: Prevent Admin Elevation during Registration
    const hackEmail = `hacker_${uniqueId}@evil.com`;
    const hackRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        name: 'Attacker Attempting Admin Role',
        email: hackEmail,
        phone: '+91 90000 00000',
        password: 'attackPassword123',
        role: 'admin', // Malicious attempt to elevate role
      }
    );

    assert(
      hackRes.statusCode === 201 && hackRes.body.user.role === 'customer',
      'Security: Public registration enforces role="customer" and rejects admin elevation'
    );

    // TEST 3: Prevent Duplicate Email Registration
    const dupRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        name: 'Duplicate Buyer',
        email: testCustomerEmail,
        phone: '+91 98427 11111',
        password: 'password123',
      }
    );

    assert(
      dupRes.statusCode === 400 && dupRes.body.success === false,
      'Registration rejects duplicate email with 400 Bad Request'
    );

    // TEST 4: Registration Validation (Missing Password)
    const invalidRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        name: 'No Password User',
        email: `nopw_${uniqueId}@test.com`,
        phone: '+91 99999 88888',
      }
    );

    assert(
      invalidRes.statusCode === 400 && invalidRes.body.success === false,
      'Registration validates required fields (missing password rejects)'
    );

    // TEST 5: Customer Login Success
    console.log('\n[Phase 2] Customer Login Tests:');
    const loginRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        email: testCustomerEmail,
        password: 'securePassword123',
      }
    );

    assert(
      loginRes.statusCode === 200 && loginRes.body.success === true && loginRes.body.token,
      'Customer Login succeeds with valid email + password'
    );
    assert(
      loginRes.body.user.email === testCustomerEmail && !loginRes.body.user.password,
      'Customer Login returns sanitized user object without password'
    );

    // TEST 6: Customer Login Wrong Password
    const wrongPwRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        email: testCustomerEmail,
        password: 'WrongPassword999',
      }
    );

    assert(
      wrongPwRes.statusCode === 401 && wrongPwRes.body.success === false,
      'Customer Login fails with 401 on incorrect password'
    );

    // TEST 7: Customer Login Unknown Email
    const unknownEmailRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        email: 'nonexistent_buyer_email_404@nowhere.com',
        password: 'anyPassword123',
      }
    );

    assert(
      unknownEmailRes.statusCode === 401 && unknownEmailRes.body.success === false,
      'Customer Login fails with 401 on non-existent email'
    );

    // TEST 8: Admin Login Success
    console.log('\n[Phase 3] Admin Login & Authorization Tests:');
    const adminLoginRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/admin/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        email: testAdminEmail,
        password: 'admin123',
      }
    );

    assert(
      adminLoginRes.statusCode === 200 && adminLoginRes.body.success === true && adminLoginRes.body.token,
      'Admin Login succeeds with valid admin credentials'
    );
    assert(
      adminLoginRes.body.user && adminLoginRes.body.user.role === 'admin',
      'Admin Login returns verified role="admin"'
    );
    adminToken = adminLoginRes.body.token;

    // TEST 9: Customer Attempting Admin Login Rejected
    const customerAdminAttempt = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/admin/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        email: testCustomerEmail,
        password: 'securePassword123',
      }
    );

    assert(
      customerAdminAttempt.statusCode === 403,
      'Security: Customer attempting admin login is rejected with 403 Forbidden'
    );

    // TEST 10: Admin Login Wrong Password
    const adminWrongPw = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/admin/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        email: testAdminEmail,
        password: 'wrongAdminPasscode',
      }
    );

    assert(
      adminWrongPw.statusCode === 401,
      'Admin Login fails with 401 on incorrect password'
    );

    // TEST 11: Protected Route /api/auth/me without Token
    console.log('\n[Phase 4] JWT Middleware & Route Protection Tests:');
    const noTokenRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/me',
      method: 'GET',
    });

    assert(
      noTokenRes.statusCode === 401 && noTokenRes.body.success === false,
      'Protected API /api/auth/me rejects request without token (401)'
    );

    // TEST 12: Protected Route with Invalid Token
    const invalidTokenRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/me',
      method: 'GET',
      headers: { Authorization: 'Bearer this.is.an.invalid.jwt.token' },
    });

    assert(
      invalidTokenRes.statusCode === 401 && invalidTokenRes.body.success === false,
      'Protected API rejects invalid JWT with 401'
    );

    // TEST 13: Protected Route with Valid Customer Token
    const validMeRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/me',
      method: 'GET',
      headers: { Authorization: `Bearer ${customerToken}` },
    });

    assert(
      validMeRes.statusCode === 200 && validMeRes.body.user.email === testCustomerEmail,
      'Protected API /api/auth/me returns authenticated customer profile'
    );

    // TEST 14: Customer Accessing Admin API Blocked (403)
    const customerOnAdminApi = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/admin/verify',
      method: 'GET',
      headers: { Authorization: `Bearer ${customerToken}` },
    });

    assert(
      customerOnAdminApi.statusCode === 403,
      'Backend Authorization: Customer accessing /api/admin/verify receives 403 Forbidden'
    );

    // TEST 15: Admin Accessing Admin API Allowed (200)
    const adminOnAdminApi = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/admin/verify',
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert(
      adminOnAdminApi.statusCode === 200 && adminOnAdminApi.body.success === true,
      'Backend Authorization: Admin accessing /api/admin/verify is authorized (200 OK)'
    );

    // TEST 16: Customer Profile Update
    console.log('\n[Phase 6] Customer Profile Update Tests:');
    const updateProfileRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/profile',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
      },
      {
        name: 'Vignesh K. (Updated)',
        businessName: 'Vignesh Global Textiles Pvt Ltd',
        phone: '+91 94422 33445',
        address: '100 Industrial Loom Zone, Perundurai',
        city: 'Erode',
        state: 'Tamil Nadu',
        pincode: '638052',
        gstin: '33AAACB9999F1Z9',
      }
    );

    assert(
      updateProfileRes.statusCode === 200 && updateProfileRes.body.success === true,
      '16.1 Customer Profile Update returns 200 OK',
      JSON.stringify(updateProfileRes.body)
    );
    assert(
      updateProfileRes.body.user?.businessName === 'Vignesh Global Textiles Pvt Ltd',
      '16.2 Customer businessName updated correctly'
    );
    assert(
      updateProfileRes.body.user?.gstin === '33AAACB9999F1Z9',
      '16.3 Customer GSTIN updated and capitalized'
    );

    // TEST 17: Verify GET /api/auth/me returns updated fields
    const updatedMeRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/me',
      method: 'GET',
      headers: { Authorization: `Bearer ${customerToken}` },
    });

    assert(
      updatedMeRes.body.user?.name === 'Vignesh K. (Updated)',
      '17.1 GET /api/auth/me reflects updated customer name'
    );
    assert(
      updatedMeRes.body.user?.pincode === '638052',
      '17.2 GET /api/auth/me reflects updated pincode'
    );

    console.log('\n========================================================');
    console.log(`📊 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('[Test Error]', error);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    await mongoose.connection.close();
    process.exit(0);
  }
};

runAuthTests();
