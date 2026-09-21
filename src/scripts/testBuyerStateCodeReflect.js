import mongoose from 'mongoose';
import dotenv from 'dotenv';
import http from 'http';
import app from '../index.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
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

const PORT = 5099;

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

export const runBuyerStateCodeReflectTests = async () => {
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
    console.log('Connected to MongoDB for Buyer State Code Reflection Tests');

    server = app.listen(PORT);
    await new Promise((resolve) => server.on('listening', resolve));
    console.log(`Test server running on port ${PORT}\n`);

    // Clean test accounts
    await User.deleteMany({
      email: { $in: ['admin.statecode@gowthamtex.com', 'buyer.statecode@gmail.com'] },
    });

    // 1. Create Admin
    const adminUser = await User.create({
      name: 'Admin StateCode Tester',
      email: 'admin.statecode@gowthamtex.com',
      password: 'admin123password',
      role: 'admin',
      phone: '9566647890',
    });

    // Login Admin
    const adminAuthRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/admin/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: 'admin.statecode@gowthamtex.com', password: 'admin123password' }
    );
    const adminToken = adminAuthRes.body?.token;
    assert(adminAuthRes.statusCode === 200, 'Admin login succeeded');

    // 2. Register Buyer with Karnataka state and stateCode: '29'
    const buyerRegRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        name: 'Karnataka Textiles Ltd',
        businessName: 'Karnataka Textiles Ltd',
        email: 'buyer.statecode@gmail.com',
        phone: '9845012345',
        password: 'buyer123password',
        address: '100 MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        stateCode: '29',
        pincode: '560001',
        gstin: '29ABCDE1234F1Z5',
      }
    );
    const buyerToken = buyerRegRes.body?.token;
    assert(buyerRegRes.statusCode === 201, 'Buyer registered with Karnataka State Code 29');
    assert(buyerRegRes.body?.user?.stateCode === '29', 'User object returns stateCode 29');

    // 3. Find/Create product and size
    let product = await Product.findOne({ active: true });
    if (!product) {
      product = await Product.create({
        name: 'White Terry Towel Premium',
        description: 'Quality 100% combed cotton towel',
        category: 'Terry Towels',
        active: true,
      });
    }

    let size = await Size.findOne({ product: product._id, active: true });
    if (!size) {
      size = await Size.create({
        product: product._id,
        size: '30x60',
        price: 150,
        stock: 500,
        active: true,
      });
    } else {
      size.stock = 500;
      await size.save();
    }

    // 4. Buyer creates an Order
    const createOrderRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/orders',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${buyerToken}`,
        },
      },
      {
        customerDetails: {
          name: 'Karnataka Textiles Ltd',
          businessName: 'Karnataka Textiles Ltd',
          phone: '9845012345',
          email: 'buyer.statecode@gmail.com',
          gstin: '29ABCDE1234F1Z5',
          state: 'Karnataka',
          stateCode: '29',
        },
        deliveryDetails: {
          addressLine1: '100 MG Road',
          addressLine2: 'Indiranagar',
          city: 'Bengaluru',
          state: 'Karnataka',
          stateCode: '29',
          pincode: '560001',
          contactPhone: '9845012345',
          transporter: 'VRL Logistics Cargo',
        },
        items: [
          {
            productId: product._id.toString(),
            productName: product.name,
            sizeId: size._id.toString(),
            size: size.size,
            quantity: 50,
          },
        ],
      }
    );

    assert(createOrderRes.statusCode === 201, 'Buyer placed order successfully');
    const order = createOrderRes.body?.order;
    assert(order?.buyerStateCode === '29', 'Order buyerStateCode initialized to 29');
    assert(order?.deliveryDetails?.stateCode === '29', 'Order deliveryDetails.stateCode is 29');

    // 5. Buyer fetches Proforma/Draft Invoice
    const buyerDraftRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${order._id}/invoice`,
      method: 'GET',
      headers: { Authorization: `Bearer ${buyerToken}` },
    });

    assert(buyerDraftRes.statusCode === 200, 'Buyer fetched draft bill');
    assert(buyerDraftRes.body?.invoice?.buyerStateCode === '29', `Buyer bill displays buyerStateCode: 29 (got ${buyerDraftRes.body?.invoice?.buyerStateCode})`);
    assert(buyerDraftRes.body?.invoice?.deliveryAddress?.stateCode === '29', 'Buyer bill deliveryAddress.stateCode is 29');

    // 6. Admin edits the bill to Kerala: state: 'Kerala', stateCode: '32'
    const editBillRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/orders/${order._id}/invoice`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        customerName: 'Cochin Spices & Towels Ltd',
        buyerGstin: '32AABCC1234K1Z2',
        billingAddress: '55 Marine Drive, Kochi',
        customerContact: '9847012345',
        customerEmail: 'accounts@cochintowels.com',
        buyerState: 'Kerala',
        buyerStateCode: '32',
        items: [
          {
            product: product._id,
            productName: product.name,
            size: size.size,
            hsnCode: '6302.60',
            quantity: 60,
            price: 150,
            subtotal: 9000,
          },
        ],
      }
    );

    assert(editBillRes.statusCode === 200, 'Admin successfully edited bill');
    assert(editBillRes.body?.invoice?.buyerStateCode === '32', `Admin edit response returns buyerStateCode: 32 (got ${editBillRes.body?.invoice?.buyerStateCode})`);
    assert(editBillRes.body?.invoice?.customerDetails?.stateCode === '32', 'Admin edit customerDetails.stateCode is 32');
    assert(editBillRes.body?.invoice?.deliveryAddress?.stateCode === '32', 'Admin edit deliveryAddress.stateCode is 32');

    // 7. Buyer fetches bill after Admin edit -> MUST reflect Kerala State Code '32'
    const buyerGetAfterEditRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${order._id}/invoice`,
      method: 'GET',
      headers: { Authorization: `Bearer ${buyerToken}` },
    });

    assert(buyerGetAfterEditRes.statusCode === 200, 'Buyer fetched updated bill');
    assert(buyerGetAfterEditRes.body?.invoice?.buyerStateCode === '32', `Buyer portal bill reflects edited buyerStateCode 32 (got ${buyerGetAfterEditRes.body?.invoice?.buyerStateCode})`);
    assert(buyerGetAfterEditRes.body?.invoice?.buyerState === 'Kerala', `Buyer portal bill reflects buyerState: Kerala (got ${buyerGetAfterEditRes.body?.invoice?.buyerState})`);

    // 8. Admin fetches bill -> MUST also reflect Kerala State Code '32'
    const adminGetAfterEditRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${order._id}/invoice`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert(adminGetAfterEditRes.statusCode === 200, 'Admin fetched updated bill');
    assert(adminGetAfterEditRes.body?.invoice?.buyerStateCode === '32', `Admin portal bill reflects edited buyerStateCode 32 (got ${adminGetAfterEditRes.body?.invoice?.buyerStateCode})`);

    // 9. Admin confirms payment
    const confirmPayRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/orders/${order._id}/payment`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        paymentMethod: 'UPI',
        paymentReference: 'UPI-REF-STATE-TEST-12345',
        amountConfirmed: 9450,
      }
    );

    assert(confirmPayRes.statusCode === 200, 'Admin payment confirmation succeeded');

    // 10. Verify final official invoice in MongoDB and API for both Buyer and Admin
    const buyerFinalInvRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${order._id}/invoice`,
      method: 'GET',
      headers: { Authorization: `Bearer ${buyerToken}` },
    });

    assert(buyerFinalInvRes.statusCode === 200, 'Buyer fetched final invoice');
    assert(buyerFinalInvRes.body?.invoice?.buyerStateCode === '32', `Final buyer invoice retains buyerStateCode 32 (got ${buyerFinalInvRes.body?.invoice?.buyerStateCode})`);

    const adminFinalInvRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${order._id}/invoice`,
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert(adminFinalInvRes.statusCode === 200, 'Admin fetched final invoice');
    assert(adminFinalInvRes.body?.invoice?.buyerStateCode === '32', `Final admin invoice retains buyerStateCode 32 (got ${adminFinalInvRes.body?.invoice?.buyerStateCode})`);

    console.log(`\n========================================`);
    console.log(`Buyer State Code Reflection Tests Completed: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    return failed === 0;
  } catch (err) {
    console.error('Test execution error:', err);
    return false;
  } finally {
    if (server) {
      server.close();
    }
    await mongoose.connection.close();
  }
};

runBuyerStateCodeReflectTests().then((success) => {
  process.exit(success ? 0 : 1);
});
