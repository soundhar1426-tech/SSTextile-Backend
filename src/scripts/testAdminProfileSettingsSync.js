import mongoose from 'mongoose';
import dotenv from 'dotenv';
import http from 'http';
import app from '../index.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Settings } from '../models/Settings.js';

dotenv.config();

const PORT = 5016;

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

const assert = (condition, testName, details = '') => {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    console.error(`  ❌ FAIL: ${testName} ${details ? '(' + details + ')' : ''}`);
    process.exitCode = 1;
  }
};

export const runAdminProfileSyncTests = async () => {
  console.log('\n========================================================');
  console.log('🧪 TESTING ADMIN PROFILE & SETTINGS SITTEWIDE SYNC');
  console.log('========================================================\n');

  let server;
  try {
    await connectDB();

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(PORT, resolve));
    console.log(`Test server running on port ${PORT}\n`);

    // Clean up test admin
    await User.deleteMany({ email: 'admin.sync_test@gowthamtex.com' });
    const adminUser = await User.create({
      name: 'Initial Admin Name',
      businessName: 'Initial Business',
      email: 'admin.sync_test@gowthamtex.com',
      password: 'admin123password',
      phone: '+91 99999 11111',
      role: 'admin',
      gstin: '33AAAAA0000A1Z5',
      address: 'Old Admin Address',
      city: 'Erode',
      state: 'Tamil Nadu',
      pincode: '638001',
    });

    // 1. Login as Admin
    const loginRes = await request(
      {
        hostname: 'localhost',
        port: PORT,
        path: '/api/auth/admin/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: 'admin.sync_test@gowthamtex.com', password: 'admin123password' }
    );

    const adminToken = loginRes.body?.token;
    assert(!!adminToken, 'Obtained Admin JWT Token');

    // 2. Admin updates profile in /api/auth/profile
    const updateProfileRes = await request(
      {
        hostname: 'localhost',
        port: PORT,
        path: '/api/auth/profile',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        name: 'Updated Admin Owner',
        businessName: 'Gowtham Tex Prime Mills',
        phone: '+91 95666 88888',
        gstin: '33AABCG7777F1Z4',
        address: '99 Loom Industrial Estate, Perundurai',
        city: 'Erode',
        state: 'Tamil Nadu',
        pincode: '638052',
      }
    );

    assert(updateProfileRes.statusCode === 200, 'PUT /api/auth/profile returns 200 OK');
    assert(updateProfileRes.body?.user?.gstin === '33AABCG7777F1Z4', 'User GSTIN updated to 33AABCG7777F1Z4');
    assert(updateProfileRes.body?.settings?.gstin === '33AABCG7777F1Z4', 'Settings GSTIN synchronized from profile update');
    assert(updateProfileRes.body?.settings?.name === 'Gowtham Tex Prime Mills', 'Settings mill name synchronized to Gowtham Tex Prime Mills');
    assert(updateProfileRes.body?.settings?.phone === '+91 95666 88888', 'Settings mill phone synchronized');

    // 3. Verify public GET /api/settings has the updated GSTIN and details
    const publicSettingsRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/settings',
      method: 'GET',
    });

    assert(publicSettingsRes.statusCode === 200, 'Public GET /api/settings returns 200');
    assert(publicSettingsRes.body?.settings?.gstin === '33AABCG7777F1Z4', 'Public website receives updated GSTIN 33AABCG7777F1Z4');
    assert(publicSettingsRes.body?.settings?.name === 'Gowtham Tex Prime Mills', 'Public website receives updated mill name');
    assert(publicSettingsRes.body?.settings?.address.includes('99 Loom Industrial Estate'), 'Public website receives updated dispatch address');

    // 4. Admin updates mill settings in /api/admin/settings
    const updateSettingsRes = await request(
      {
        hostname: 'localhost',
        port: PORT,
        path: '/api/admin/settings',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        millSettings: {
          name: 'Gowtham Tex Global Apex Mills',
          gstin: '33AAACG5555M1Z9',
          phone: '+91 95666 44444',
          address: '77 Cotton Road, Erode 638002',
        },
      }
    );

    assert(updateSettingsRes.statusCode === 200, 'PUT /api/admin/settings returns 200');
    assert(updateSettingsRes.body?.settings?.gstin === '33AAACG5555M1Z9', 'Settings GSTIN updated to 33AAACG5555M1Z9');

    // 5. Verify GET /api/auth/me reflects the synced admin user
    const meRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/auth/me',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert(meRes.statusCode === 200, 'GET /api/auth/me returns 200');
    assert(meRes.body?.user?.gstin === '33AAACG5555M1Z9', 'Admin User profile reflects updated GSTIN from Admin Settings');
    assert(meRes.body?.user?.name === 'Gowtham Tex Global Apex Mills', 'Admin User profile reflects updated name');

    console.log('\n========================================================');
    console.log('🎉 ALL ADMIN PROFILE & SETTINGS SYNC TESTS PASSED!');
    console.log('========================================================\n');
  } catch (error) {
    console.error('Test Suite Error:', error);
    process.exitCode = 1;
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.connection.close();
  }
};

runAdminProfileSyncTests();
