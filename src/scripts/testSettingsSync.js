import mongoose from 'mongoose';
import dotenv from 'dotenv';
import http from 'http';
import app from '../index.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Settings } from '../models/Settings.js';
import { Order } from '../models/Order.js';
import { OrderItem } from '../models/OrderItem.js';
import { Invoice } from '../models/Invoice.js';
import { Product } from '../models/Product.js';
import { Size } from '../models/Size.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const PORT = 5015;

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

export const runSettingsTests = async () => {
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
    await connectDB();
    console.log('Connected to MongoDB');

    server = app.listen(PORT);
    await new Promise((resolve) => server.on('listening', resolve));
    console.log(`Test server running on port ${PORT}\n`);

    // 1. Get or Create Admin User and Login
    await User.deleteMany({ email: 'admin.settings_test@gowthamtex.com' });
    const adminUser = await User.create({
      name: 'Settings Test Admin',
      email: 'admin.settings_test@gowthamtex.com',
      password: 'admin123password',
      role: 'admin',
      phone: '+919566647899',
      city: 'Erode',
      state: 'Tamil Nadu',
      pincode: '638052',
    });

    const authRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/admin/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: 'admin.settings_test@gowthamtex.com', password: 'admin123password' }
    );

    const token = authRes.body?.token;
    assert(!!token, 'Obtained Admin JWT Token');

    // 2. Public GET /api/settings
    const getRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/settings',
      method: 'GET',
    });
    assert(getRes.statusCode === 200, 'GET /api/settings returns 200', `Status: ${getRes.statusCode}`);
    assert(getRes.body?.success === true, 'GET /api/settings returns success: true');
    assert(!!getRes.body?.settings, 'GET /api/settings returns settings object');

    // 3. Admin PUT /api/admin/settings - Update Mill Details
    const testUpdateData = {
      millSettings: {
        name: 'Gowtham Tex Global Mills',
        tagline: 'PREMIUM WEAVING MILL • TAMIL NADU',
        subTagline: 'Export Quality Pure Cotton Towels.',
        gstin: '33AABCG1234F1Z9',
        hsnCode: '630231',
        stateCode: '33 (Tamil Nadu)',
        address: '99 Industrial Estate, Bhavani Main Road, Erode 638004',
        phone: '+91 94433 11223',
        email: 'billing@gowthamtex.com',
        bankDetails: {
          bankName: 'HDFC Bank Ltd',
          accountName: 'Gowtham Tex Global Mills Private Limited',
          accountNumber: '50200098765432',
          ifsc: 'HDFC0001234',
          branch: 'Bhavani Main Branch, Erode',
          accountType: 'Current Account',
        },
      },
      discountSettings: {
        enabled: true,
        tiers: [
          { minQuantity: 100, discountPercent: 3, label: 'Standard Wholesale' },
          { minQuantity: 500, discountPercent: 7, label: 'Bulk Wholesale' },
        ],
      },
    };

    const putRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/admin/settings',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
      testUpdateData
    );

    assert(putRes.statusCode === 200, 'PUT /api/admin/settings returns 200', `Status: ${putRes.statusCode}`);
    assert(putRes.body?.settings?.name === 'Gowtham Tex Global Mills', 'Mill name persisted as Gowtham Tex Global Mills');
    assert(putRes.body?.settings?.bankDetails?.bankName === 'HDFC Bank Ltd', 'Bank name persisted as HDFC Bank Ltd');
    assert(putRes.body?.settings?.gstin === '33AABCG1234F1Z9', 'GSTIN persisted');

    // 4. Verify Public GET /api/settings returns the updated data
    const verifyGetRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/settings',
      method: 'GET',
    });
    assert(
      verifyGetRes.body?.settings?.name === 'Gowtham Tex Global Mills',
      'Public GET /api/settings delivers updated mill name to website users'
    );
    assert(
      verifyGetRes.body?.settings?.bankDetails?.accountNumber === '50200098765432',
      'Public GET /api/settings delivers updated bank account'
    );

    // 5. Test Invoice Generation captures the snapshot
    let product = await Product.findOne();
    if (!product) {
      product = await Product.create({
        name: 'Test Towel',
        hsnCode: '630231',
        description: 'Test towel',
      });
    }

    let size = await Size.findOne({ product: product._id });
    if (!size) {
      size = await Size.create({
        product: product._id,
        size: '30x60',
        gsm: 450,
        price: 100,
        stock: 500,
        active: true,
      });
    }

    const testOrder = await Order.create({
      orderNumber: `ORD-TEST-${Date.now()}`,
      customer: adminUser._id,
      items: [],
      shippingAddress: {
        companyName: 'ABC Textiles',
        contactPerson: 'Buyer Test',
        phone: '9876543210',
        streetAddress: '123 Market Street',
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        pincode: '641001',
      },
      subtotal: 10000,
      discountTotal: 0,
      taxableAmount: 10000,
      gstRate: 5,
      cgstAmount: 250,
      sgstAmount: 250,
      igstAmount: 0,
      gstTotal: 500,
      totalAmount: 10500,
      status: 'pending_payment',
      paymentMethod: 'bank_transfer',
      paymentStatus: 'pending',
    });

    const orderItem = await OrderItem.create({
      order: testOrder._id,
      customer: adminUser._id,
      product: product._id,
      productName: product.name,
      size: size.size || '30x60',
      sizeRef: size._id,
      quantity: 100,
      price: 100,
      subtotal: 10000,
    });

    testOrder.items.push(orderItem._id);
    await testOrder.save();

    // Confirm payment and create invoice
    const confirmRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/orders/${testOrder._id}/payment`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
      {
        paymentReference: 'UTR123456789',
        notes: 'Test payment confirmation',
      }
    );

    assert(confirmRes.statusCode === 200, 'Order payment confirmation returns 200', `Status: ${confirmRes.statusCode}`);
    
    // Check created invoice
    const invoice = await Invoice.findOne({ order: testOrder._id });
    assert(!!invoice, 'Invoice created in DB');
    assert(invoice?.millDetails?.name === 'Gowtham Tex Global Mills', 'Invoice contains snapshot mill name');
    assert(invoice?.millDetails?.bankDetails?.bankName === 'HDFC Bank Ltd', 'Invoice contains snapshot bank name');
    assert(invoice?.millGstin === '33AABCG1234F1Z9', 'Invoice contains snapshot mill GSTIN');

    // Clean up test order, invoice, user
    await Invoice.deleteOne({ _id: invoice?._id });
    await OrderItem.deleteOne({ _id: orderItem._id });
    await Order.deleteOne({ _id: testOrder._id });
    await User.deleteOne({ _id: adminUser._id });

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.connection.close();
  }
};

runSettingsTests();
