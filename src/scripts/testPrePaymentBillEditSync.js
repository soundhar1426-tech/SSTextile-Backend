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

const PORT = 5098;

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

export const runPrePaymentSyncTests = async () => {
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
    console.log('Connected to MongoDB for Pre-Payment Bill Edit Sync Tests');

    server = app.listen(PORT);
    await new Promise((resolve) => server.on('listening', resolve));
    console.log(`Test server running on port ${PORT}\n`);

    // Clean test accounts
    await User.deleteMany({
      email: { $in: ['admin.prepay@gowthamtex.com', 'buyer.prepay@gmail.com'] },
    });

    // 1. Create Admin
    const adminUser = await User.create({
      name: 'Admin PrePay Tester',
      email: 'admin.prepay@gowthamtex.com',
      password: 'admin123password',
      role: 'admin',
      phone: '9566647825',
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
      { email: 'admin.prepay@gowthamtex.com', password: 'admin123password' }
    );
    const adminToken = adminAuthRes.body?.token;
    assert(!!adminToken, 'Admin logged in successfully');

    // Register Buyer
    const buyerRegisterRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      {
        businessName: 'Original Buyer Textiles',
        name: 'Murugan Textiles',
        email: 'buyer.prepay@gmail.com',
        password: 'buyer123password',
        phone: '9842100001',
        address: '10 Old Mill Road',
        city: 'Erode',
        state: 'Tamil Nadu',
        pincode: '638001',
        gstin: '33AAACM1111A1Z1',
      }
    );
    assert(buyerRegisterRes.statusCode === 201, 'Buyer registered successfully');
    const buyerToken = buyerRegisterRes.body?.token;
    const buyerUser = buyerRegisterRes.body?.user;

    // Create product & size
    let product = await Product.findOne({ name: 'Super White Dobby Border Towel' });
    if (!product) {
      product = await Product.create({
        name: 'Super White Dobby Border Towel',
        hsnCode: '6302.60',
        active: true,
      });
    }

    let size = await Size.findOne({ product: product._id, size: '30x60' });
    if (!size) {
      size = await Size.create({
        product: product._id,
        size: '30x60',
        stock: 1000,
        price: 150,
        active: true,
      });
    }

    // 2. Buyer creates an order (50 pieces)
    console.log('\n--- PHASE 1: Buyer creates order (Pending Payment) ---');
    const orderCreateRes = await request(
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

    assert(orderCreateRes.statusCode === 201, 'Order created with status 201');
    const createdOrder = orderCreateRes.body?.order;
    assert(createdOrder.paymentStatus === 'pending', 'Order paymentStatus is pending');
    assert(createdOrder.totalPieces === 50, 'Order total pieces is 50');

    // 3. Admin edits the bill BEFORE confirming payment
    console.log('\n--- PHASE 2: Admin edits bill BEFORE payment confirmation ---');
    const billEditPayload = {
      // Mill Details Edit
      millName: 'GOWTHAM TEX (SPECIAL MILL EXPORT)',
      millGstin: '33TESTMILL9999',
      deityText: 'OM SHIVA',
      bankName: 'HDFC Bank Wholesale',
      accountName: 'GOWTHAM TEX SPECIAL',
      accountNumber: '99887766554433',
      ifsc: 'HDFC0001234',
      branch: 'Erode Main',
      vehicleNo: 'TN 33 ZZ 8888',
      transportMode: 'Direct Express Cargo',
      placeOfSupply: 'Tamil Nadu (33)',
      ewbNo: 'EWB-8899001122',

      // Buyer Details Edit
      customerName: 'Murugan Luxury Fabrics Pvt Ltd',
      buyerGstin: '33EDITEDGSTIN99',
      billingAddress: '45 Export Complex, Industrial Area, Erode - 638009',
      customerContact: '9842199999',
      customerEmail: 'billing@muruganfabrics.com',
      buyerState: 'Tamil Nadu',
      buyerStateCode: '33',

      // Items & Pieces Edit: 2 items (120 pcs @ 160 + 30 pcs @ 110 = 150 pcs)
      items: [
        {
          product: product._id,
          productName: 'Super White Dobby Border Towel',
          size: '30x60',
          hsnCode: '6302.60',
          quantity: 120,
          price: 160,
          subtotal: 19200,
        },
        {
          product: product._id,
          productName: 'Cotton Hand Loom Towel Medium',
          size: '27x54',
          hsnCode: '6302.91',
          quantity: 30,
          price: 110,
          subtotal: 3300,
        },
      ],
      totalPieces: 150,
      subtotal: 22500,
      tax: 1125,
      totalAmount: 23625,
    };

    const updateBillRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/invoices/${createdOrder._id}`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      billEditPayload
    );

    assert(updateBillRes.statusCode === 200, 'Admin successfully updated bill before payment');
    assert(updateBillRes.body?.invoice?.isCustomized === true, 'Invoice marked as isCustomized: true');
    assert(updateBillRes.body?.invoice?.totalPieces === 150, 'Invoice totalPieces updated to 150');
    assert(updateBillRes.body?.invoice?.totalAmount === 23625, 'Invoice totalAmount updated to ₹23,625');

    // 4. Verify that Buyer Portal queries reflect the admin edits immediately
    console.log('\n--- PHASE 3: Buyer Portal queries verify bill edits reflect immediately ---');

    // A. Buyer fetches single order by ID (GET /api/orders/:id)
    const buyerOrderRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${createdOrder._id}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${buyerToken}` },
    });

    assert(buyerOrderRes.statusCode === 200, 'Buyer fetched order details');
    const buyerOrderData = buyerOrderRes.body?.order;
    assert(
      buyerOrderData?.customerDetails?.businessName === 'Murugan Luxury Fabrics Pvt Ltd',
      'Buyer Order reflects edited Business Name: "Murugan Luxury Fabrics Pvt Ltd"'
    );
    assert(
      buyerOrderData?.customerDetails?.gstin === '33EDITEDGSTIN99',
      'Buyer Order reflects edited GSTIN: "33EDITEDGSTIN99"'
    );
    assert(
      buyerOrderData?.deliveryDetails?.addressLine1 === '45 Export Complex, Industrial Area, Erode - 638009',
      'Buyer Order reflects edited Delivery Address'
    );
    assert(
      buyerOrderData?.totalPieces === 150,
      `Buyer Order reflects updated Total Pieces (150 PCS, got: ${buyerOrderData?.totalPieces})`
    );
    assert(
      buyerOrderData?.totalAmount === 23625,
      `Buyer Order reflects updated Grand Total (₹23,625, got: ${buyerOrderData?.totalAmount})`
    );
    assert(
      buyerOrderData?.items?.length === 2,
      `Buyer Order itemized list contains 2 updated items (got: ${buyerOrderData?.items?.length})`
    );
    assert(
      buyerOrderData?.items?.[0]?.quantity === 120,
      `First item quantity is 120 PCS (got: ${buyerOrderData?.items?.[0]?.quantity})`
    );
    assert(
      buyerOrderData?.items?.[1]?.quantity === 30,
      `Second item quantity is 30 PCS (got: ${buyerOrderData?.items?.[1]?.quantity})`
    );

    // B. Buyer fetches all orders (GET /api/orders)
    const buyerAllOrdersRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/orders',
      method: 'GET',
      headers: { Authorization: `Bearer ${buyerToken}` },
    });

    assert(buyerAllOrdersRes.statusCode === 200, 'Buyer fetched orders list');
    const listedOrder = buyerAllOrdersRes.body?.orders?.find((o) => o._id === createdOrder._id);
    assert(!!listedOrder, 'Listed order found in customer orders');
    assert(listedOrder?.totalPieces === 150, 'Listed order reflects 150 total pieces');
    assert(listedOrder?.totalAmount === 23625, 'Listed order reflects ₹23,625 total value');
    assert(listedOrder?.items?.length === 2, 'Listed order reflects 2 consignment items');

    // C. Buyer fetches Invoice / Proforma Bill (GET /api/orders/:id/invoice)
    const buyerInvoiceRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${createdOrder._id}/invoice`,
      method: 'GET',
      headers: { Authorization: `Bearer ${buyerToken}` },
    });

    assert(buyerInvoiceRes.statusCode === 200, 'Buyer fetched customized Proforma Bill (200 OK)');
    const buyerInv = buyerInvoiceRes.body?.invoice;
    assert(
      buyerInv?.millDetails?.name === 'GOWTHAM TEX (SPECIAL MILL EXPORT)',
      'Proforma Bill reflects Admin Mill Name'
    );
    assert(
      buyerInv?.millDetails?.bankDetails?.bankName === 'HDFC Bank Wholesale',
      'Proforma Bill reflects Admin Bank Name'
    );
    assert(
      buyerInv?.millDetails?.bankDetails?.accountNumber === '99887766554433',
      'Proforma Bill reflects Admin Bank Account Number'
    );
    assert(
      buyerInv?.customerDetails?.businessName === 'Murugan Luxury Fabrics Pvt Ltd',
      'Proforma Bill reflects Buyer Business Name'
    );
    assert(
      buyerInv?.customerDetails?.gstin === '33EDITEDGSTIN99',
      'Proforma Bill reflects Buyer GSTIN'
    );
    assert(
      buyerInv?.items?.length === 2,
      'Proforma Bill reflects 2 itemized product lines'
    );
    assert(
      buyerInv?.totalPieces === 150,
      'Proforma Bill reflects 150 total pieces'
    );
    assert(
      buyerInv?.totalAmount === 23625,
      'Proforma Bill reflects ₹23,625 total amount'
    );

    // 5. Admin confirms payment
    console.log('\n--- PHASE 4: Admin confirms payment (Customizations must be preserved) ---');
    const confirmPayRes = await request(
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
      { paymentMethod: 'Bank Transfer', paymentReference: 'NEFT-HDFC-998877', amount: 23625 }
    );

    assert(confirmPayRes.statusCode === 200, 'Payment confirmed successfully');
    const finalOrder = confirmPayRes.body?.order;
    const finalInv = confirmPayRes.body?.invoice;

    assert(finalOrder?.paymentStatus === 'paid', 'Order paymentStatus is "paid"');
    assert(finalOrder?.invoiceStatus === 'generated', 'Order invoiceStatus is "generated"');
    assert(finalInv?.paymentStatus === 'paid', 'Invoice paymentStatus is "paid"');
    assert(finalInv?.isCustomized === true, 'Invoice isCustomized remains TRUE');
    assert(
      finalInv?.millDetails?.name === 'GOWTHAM TEX (SPECIAL MILL EXPORT)',
      'Confirmed Invoice preserves Admin Mill Name'
    );
    assert(
      finalInv?.customerDetails?.businessName === 'Murugan Luxury Fabrics Pvt Ltd',
      'Confirmed Invoice preserves Buyer Business Name'
    );
    assert(
      finalInv?.items?.length === 2,
      'Confirmed Invoice preserves 2 product items'
    );
    assert(
      finalInv?.totalPieces === 150,
      'Confirmed Invoice preserves 150 total pieces'
    );
    assert(
      finalInv?.totalAmount === 23625,
      'Confirmed Invoice preserves ₹23,625 total amount'
    );

    // 6. Buyer fetches final Tax Invoice after payment confirmation
    console.log('\n--- PHASE 5: Buyer fetches final Tax Invoice ---');
    const buyerFinalInvRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/orders/${createdOrder._id}/invoice`,
      method: 'GET',
      headers: { Authorization: `Bearer ${buyerToken}` },
    });

    assert(buyerFinalInvRes.statusCode === 200, 'Buyer fetches final confirmed Tax Invoice');
    const buyerFinalInv = buyerFinalInvRes.body?.invoice;
    assert(buyerFinalInv?.paymentStatus === 'paid', 'Final invoice payment status is "paid"');
    assert(
      buyerFinalInv?.customerDetails?.businessName === 'Murugan Luxury Fabrics Pvt Ltd',
      'Final invoice displays edited Buyer Business Name'
    );
    assert(
      buyerFinalInv?.totalPieces === 150,
      'Final invoice displays 150 total consignment pieces'
    );
    assert(
      buyerFinalInv?.totalAmount === 23625,
      'Final invoice displays ₹23,625 grand total'
    );

    // Clean up
    await Invoice.deleteMany({ order: createdOrder._id });
    await OrderItem.deleteMany({ order: createdOrder._id });
    await Order.deleteMany({ _id: createdOrder._id });
    await User.deleteMany({
      email: { $in: ['admin.prepay@gowthamtex.com', 'buyer.prepay@gmail.com'] },
    });

    console.log(`\n========================================`);
    console.log(`PRE-PAYMENT BILL EDIT SYNC RESULTS: ${passed} PASSED, ${failed} FAILED`);
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

runPrePaymentSyncTests();
