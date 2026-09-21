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

const PORT = 5025;

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

export const runBillSyncTests = async () => {
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
    console.log('Connected to MongoDB for Bill Sync Tests');

    server = app.listen(PORT);
    await new Promise((resolve) => server.on('listening', resolve));
    console.log(`Test server running on port ${PORT}\n`);

    // Clean test accounts
    await User.deleteMany({
      email: { $in: ['admin.billsync@gowthamtex.com', 'buyer.billsync@gmail.com'] },
    });

    // 1. Create Admin & Register Customer via API with all Billing details
    const adminUser = await User.create({
      name: 'Admin Bill Tester',
      email: 'admin.billsync@gowthamtex.com',
      password: 'admin123password',
      role: 'admin',
      phone: '9566647825',
    });

    const buyerRegisterRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        businessName: 'Ramesh Textiles',
        name: 'Ramesh Kumar',
        email: 'buyer.billsync@gmail.com',
        password: 'buyer123password',
        phone: '9842155667',
        address: '12 Weaver Street',
        city: 'Salem',
        state: 'Tamil Nadu',
        pincode: '636001',
        gstin: '33AAACR1234F1Z5',
      }
    );

    assert(buyerRegisterRes.statusCode === 201, 'Buyer registered with all billing parameters via API');
    assert(buyerRegisterRes.body?.user?.businessName === 'Ramesh Textiles', 'Registered User has businessName');
    assert(buyerRegisterRes.body?.user?.gstin === '33AAACR1234F1Z5', 'Registered User has GSTIN');
    assert(buyerRegisterRes.body?.user?.address === '12 Weaver Street', 'Registered User has address');
    assert(buyerRegisterRes.body?.user?.city === 'Salem', 'Registered User has city');
    assert(buyerRegisterRes.body?.user?.state === 'Tamil Nadu', 'Registered User has state');
    assert(buyerRegisterRes.body?.user?.pincode === '636001', 'Registered User has pincode');

    const buyerToken = buyerRegisterRes.body?.token;
    assert(!!buyerToken, 'Buyer token generated upon registration');

    const buyerUser = await User.findOne({ email: 'buyer.billsync@gmail.com' });

    // Login Admin
    const adminAuthRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/admin/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: 'admin.billsync@gowthamtex.com', password: 'admin123password' }
    );
    const adminToken = adminAuthRes.body?.token;
    assert(!!adminToken, 'Admin logged in');

    // Create a product & size
    let product = await Product.findOne();
    if (!product) {
      product = await Product.create({
        name: 'Super White Dobby Border Towel',
        hsnCode: '6302.60',
        active: true,
      });
    }

    let size = await Size.findOne({ product: product._id });
    if (!size) {
      size = await Size.create({
        product: product._id,
        size: '30x60',
        stock: 500,
        price: 150,
        active: true,
      });
    }

    // 2. Buyer creates an order
    const orderRes = await request(
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
          name: buyerUser.name,
          businessName: buyerUser.businessName,
          phone: buyerUser.phone,
          email: buyerUser.email,
          gstin: buyerUser.gstin,
        },
        deliveryDetails: {
          addressLine1: buyerUser.address,
          city: buyerUser.city,
          state: buyerUser.state,
          pincode: buyerUser.pincode,
          contactPhone: buyerUser.phone,
          transporter: 'VRL Logistics Cargo',
        },
        items: [
          {
            productId: product._id,
            sizeId: size._id,
            quantity: 50,
          },
        ],
      }
    );

    assert(orderRes.statusCode === 201, 'Order created successfully');
    const createdOrder = orderRes.body?.order;
    assert(!!createdOrder, 'Created order exists');

    // Confirm payment by Admin to generate final invoice
    const payRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/orders/${createdOrder._id}/payment`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      { paymentMethod: 'UPI', paymentReference: 'UPI-TXN-123456' }
    );
    assert(payRes.statusCode === 200, 'Payment confirmed and Invoice created');
    const generatedInvoice = payRes.body?.invoice;
    assert(!!generatedInvoice, 'Generated invoice returned');

    // ----------------------------------------------------
    // TEST 1: Admin updates Mill Details in Admin Settings
    // ----------------------------------------------------
    console.log('\n--- TEST 1: Admin updates Mill Details in Settings ---');
    const settingsUpdateRes = await request(
      {
        hostname: '127.0.0.1',
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
          name: 'GOWTHAM TEX TEXTILE MILLS',
          tagline: 'Direct Weaving & Terry Towel Manufacturer',
          phone: '8072865362, 9489040067, 9566647834',
          gstin: '33TESTGSTIN1234',
          stateCode: '33',
          placeOfSupply: 'Tamil Nadu (33)',
          bankDetails: {
            bankName: 'Canara Bank',
            accountNumber: '112233445566',
            ifsc: 'CNRB0001234',
            branch: 'Perundurai Branch',
          },
        },
      }
    );
    assert(settingsUpdateRes.statusCode === 200, 'Admin Settings updated in DB');

    // Fetch buyer's invoice and verify updated mill details reflect
    const invAfterSettings = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${createdOrder._id}/invoice`,
      method: 'GET',
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    assert(invAfterSettings.statusCode === 200, 'Buyer fetched invoice after settings update');
    assert(
      invAfterSettings.body?.invoice?.millDetails?.name === 'GOWTHAM TEX TEXTILE MILLS',
      'Bill reflects new Mill Name from Admin Settings'
    );
    assert(
      invAfterSettings.body?.invoice?.millDetails?.bankDetails?.bankName === 'Canara Bank',
      'Bill reflects new Bank Name from Admin Settings'
    );
    assert(
      invAfterSettings.body?.invoice?.millGstin === '33TESTGSTIN1234',
      'Bill reflects new Mill GSTIN from Admin Settings'
    );

    // ----------------------------------------------------
    // TEST 2: Buyer updates their Profile
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Buyer updates Profile ---');
    const profileUpdateRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/profile',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${buyerToken}`,
        },
      },
      {
        name: 'Ramesh Sundaram',
        businessName: 'Sri Rameshwar Fabrics Private Limited',
        phone: '9842199999',
        gstin: '33NEWBUYERGSTIN1',
        address: '88 Master Weaver Avenue',
        city: 'Tirupur',
        state: 'Tamil Nadu',
        pincode: '641604',
      }
    );
    assert(profileUpdateRes.statusCode === 200, 'Buyer Profile updated');

    // Fetch invoice again and verify buyer details reflect
    const invAfterBuyerProfile = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${createdOrder._id}/invoice`,
      method: 'GET',
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    assert(
      invAfterBuyerProfile.body?.invoice?.customerDetails?.businessName === 'Sri Rameshwar Fabrics Private Limited',
      'Bill reflects updated Buyer Business Name'
    );
    assert(
      invAfterBuyerProfile.body?.invoice?.customerDetails?.gstin === '33NEWBUYERGSTIN1',
      'Bill reflects updated Buyer GSTIN'
    );
    assert(
      invAfterBuyerProfile.body?.invoice?.customerDetails?.phone === '9842199999',
      'Bill reflects updated Buyer Contact Phone'
    );

    // ----------------------------------------------------
    // TEST 3: Admin Edits Bill Customizations Directly
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Admin directly edits bill details ---');
    const billEditPayload = {
      customerName: 'Sri Rameshwar Fabrics Ltd (Special Consignment)',
      buyerGstin: '33SPECIALGST999',
      billingAddress: 'Shed 44, Special Export Zone, Tirupur - 641604',
      vehicleNo: 'TN 33 EX 9999',
      placeOfSupply: 'Tamil Nadu (33)',
      transportMode: 'Express Super Cargo Direct',
      ewbNo: 'EWB-998877665544',
      itemHsnOverrides: {
        [product._id.toString()]: '6302.31',
      },
      bankName: 'State Bank of India Special',
      accountNumber: '990011223344',
      ifsc: 'SBIN0009999',
    };

    const updateInvoiceRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/invoices/${generatedInvoice._id}`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      billEditPayload
    );
    assert(updateInvoiceRes.statusCode === 200, 'Admin invoice update PUT returned 200');
    assert(updateInvoiceRes.body?.invoice?.isCustomized === true, 'Invoice marked as isCustomized: true');

    // Fetch invoice from customer side and verify customizations persisted in DB
    const finalInvoiceFetch = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${createdOrder._id}/invoice`,
      method: 'GET',
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    const finalInv = finalInvoiceFetch.body?.invoice;
    assert(
      finalInv?.customerDetails?.businessName === 'Sri Rameshwar Fabrics Ltd (Special Consignment)',
      'Customized Customer Name persisted and returned'
    );
    assert(
      finalInv?.deliveryAddress?.addressLine1 === 'Shed 44, Special Export Zone, Tirupur - 641604',
      'Customized Delivery Address persisted and returned'
    );
    assert(finalInv?.vehicleNo === 'TN 33 EX 9999', 'Customized Vehicle No persisted and returned');
    assert(finalInv?.ewbNo === 'EWB-998877665544', 'Customized E-Way Bill No persisted and returned');
    assert(
      finalInv?.transportMode === 'Express Super Cargo Direct',
      'Customized Transport Mode persisted and returned'
    );

    console.log('\n--- TEST 4: Admin updates Bill Item Pieces, Quantities & Rates ---');
    const itemPiecesEditPayload = {
      items: [
        {
          productName: 'Premium White Bath Towel 500 GSM',
          size: '30x60',
          hsnCode: '6302.60',
          quantity: 100, // Changed from 50 to 100 pieces
          price: 180,    // Changed from 140 to 180
          subtotal: 18000,
        },
        {
          productName: 'White Cotton Hand Loom Towel',
          size: '27x54',
          hsnCode: '6302.91',
          quantity: 40,  // Added 40 pieces
          price: 110,
          subtotal: 4400,
        },
      ],
      totalPieces: 140, // 100 + 40 pieces
    };

    const updatePiecesRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/invoices/${generatedInvoice._id}`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      itemPiecesEditPayload
    );

    assert(updatePiecesRes.statusCode === 200, 'Admin item pieces & quantities PUT returned 200');
    assert(updatePiecesRes.body?.invoice?.totalPieces === 140, 'Total pieces recomputed to 140 PCS in Invoice');
    assert(updatePiecesRes.body?.invoice?.subtotal === 22400, 'Subtotal recomputed to ₹22,400 (18000 + 4400)');
    assert(updatePiecesRes.body?.invoice?.tax === 1120, '5% GST recomputed to ₹1,120 (5% of 22400)');
    assert(updatePiecesRes.body?.invoice?.totalAmount === 23520, 'Grand Total recomputed to ₹23,520 (22400 + 1120)');
    assert(updatePiecesRes.body?.invoice?.items?.length === 2, 'Invoice has 2 distinct towel items');
    assert(updatePiecesRes.body?.invoice?.items?.[0]?.quantity === 100, 'First item has 100 pieces');
    assert(updatePiecesRes.body?.invoice?.items?.[1]?.quantity === 40, 'Second item has 40 pieces');

    // Fetch from buyer endpoint
    const buyerPiecesFetch = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${createdOrder._id}/invoice`,
      method: 'GET',
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    const buyerInv = buyerPiecesFetch.body?.invoice;
    assert(buyerInv?.totalPieces === 140, 'Buyer sees updated 140 total consignment pieces');
    assert(buyerInv?.items?.[0]?.quantity === 100, 'Buyer sees item 1 with 100 pieces');
    assert(buyerInv?.items?.[1]?.quantity === 40, 'Buyer sees item 2 with 40 pieces');
    assert(buyerInv?.totalAmount === 23520, 'Buyer sees updated grand total ₹23,520');

    console.log('\n--- TEST 5: Security Check - Non-admin cannot edit bills ---');
    const unauthorizedEditRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/invoices/${generatedInvoice._id}`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${buyerToken}`, // Buyer token (not admin)
        },
      },
      {
        customerName: 'Tampered Customer Name',
      }
    );
    assert(
      unauthorizedEditRes.statusCode === 403 || unauthorizedEditRes.statusCode === 401,
      'Unauthorized buyer cannot edit bills (403 Forbidden)'
    );

    // Clean up
    await Invoice.deleteMany({ order: createdOrder._id });
    await OrderItem.deleteMany({ order: createdOrder._id });
    await Order.deleteMany({ _id: createdOrder._id });
    await User.deleteMany({
      email: { $in: ['admin.billsync@gowthamtex.com', 'buyer.billsync@gmail.com'] },
    });
    await Settings.updateMany({}, {
      $set: {
        name: 'GOWTHAM TEX',
        phone: '8072865362, 9489040067, 9566647834',
        whatsapp: '918072865362',
        gstin: '33BRWPV7711D1ZD',
        tagline: 'Whole Sale Hand Looms Cloth Manufacturer',
        subTagline: 'Export Quality Pure Cotton Towels. Direct Loom Pricing.',
      }
    });

    console.log(`\n========================================`);
    console.log(`FINAL RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);
  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.connection.close();
  }
};

runBillSyncTests();
