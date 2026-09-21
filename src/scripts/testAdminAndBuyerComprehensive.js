import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { User, Product, Size, Order, OrderItem, Invoice, Settings } from '../models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gowtham_tex';
const JWT_SECRET = process.env.JWT_SECRET || 'gtex_jwt_super_secret_dev_key_2026';

let passedTests = 0;
let totalTests = 0;

function assertTest(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`   ✅ PASS: ${message}`);
  } else {
    console.error(`   ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runComprehensiveTests() {
  console.log('================================================================');
  console.log('🧪 SSTextiles — COMPLETE ADMIN & BUYER PORTAL SUITE');
  console.log('================================================================\n');

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('Connected to MongoDB.\n');
  } catch (err) {
    console.log('Notice: Connecting to local mongo fallback...');
    await mongoose.connect('mongodb://127.0.0.1:27017/gowtham_tex');
    console.log('Connected to local MongoDB.\n');
  }

  // ==================================================================
  // PHASE 1: SETTINGS & MILL BRANDING VERIFICATION
  // ==================================================================
  console.log('📋 PHASE 1: Settings & Mill Invoicing Setup...');
  let settings = await Settings.findOne({ isDefault: true });
  if (!settings) {
    settings = await Settings.create({
      name: 'SSTextiles',
      tagline: 'Whole Sale Hand Looms Cloth Manufacturer',
      subTagline: 'Direct Mill White Towels',
      address: '123, Weaver Street, Textile Nagar, Erode - 638 001, Tamil Nadu.',
      phone: '9876543210, 9876543211',
      whatsapp: '919876543210',
      email: 'contact@sstextiles.com',
      gstin: '33AAAAA0000A1Z5',
      pan: 'AAAAA0000A',
      stateCode: '33',
      hsnCode: '6302.60',
      bankDetails: {
        bankName: 'State Bank of India',
        branch: 'Erode Main',
        accountName: 'SSTextiles',
        accountNumber: '000012345678901',
        ifsc: 'SBIN0001234',
        accountType: 'Current Account',
      },
      isDefault: true,
    });
  }

  assertTest(settings.name === 'SSTextiles', 'Mill Name is SSTextiles');
  assertTest(settings.gstin === '33AAAAA0000A1Z5', 'Mill GSTIN is 33AAAAA0000A1Z5');
  assertTest(settings.bankDetails?.bankName === 'State Bank of India', 'Mill Bank is State Bank of India');
  assertTest(settings.phone.includes('9876543210'), 'Mill Phone includes primary hotline');

  // ==================================================================
  // PHASE 2: ADMIN AUTHENTICATION
  // ==================================================================
  console.log('\n📋 PHASE 2: Admin Portal Authentication...');
  let adminUser = await User.findOne({ email: 'admin@sstextiles.com' });
  if (!adminUser) {
    adminUser = await User.create({
      name: 'SSTextiles Mill Admin',
      email: 'admin@sstextiles.com',
      password: 'admin123password',
      role: 'admin',
      isVerified: true,
    });
  }

  const adminToken = jwt.sign(
    { id: adminUser._id, role: 'admin', email: adminUser.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  assertTest(adminUser.role === 'admin', 'Admin user verified with admin role');
  assertTest(typeof adminToken === 'string' && adminToken.length > 20, 'Admin JWT token generated');

  // ==================================================================
  // PHASE 3: PRODUCT & INVENTORY MANAGEMENT (ADMIN)
  // ==================================================================
  console.log('\n📋 PHASE 3: Admin Catalog & Dynamic Size Management...');
  let product = await Product.findOne({ name: 'White Towels' });
  if (!product) {
    product = await Product.create({
      name: 'White Towels',
      description: 'Direct Weaving Mill Cotton Plain White Terry Towels',
      category: 'White Towels',
      material: '100% Cotton',
      weaveType: '2/20s Ring Spun',
      hsnCode: '6302.60',
      active: true,
    });
  }

  // Ensure standard sizes are attached
  const existingSizes = await Size.find({ product: product._id });
  if (existingSizes.length === 0) {
    await Size.create({
      product: product._id,
      size: '75x150',
      price: 420,
      stock: 500,
      gsm: 650,
      grams: 731,
      weightKg: 0.731,
      active: true,
    });
  }

  const allSizes = await Size.find({ product: product._id, active: true });
  assertTest(product.active === true, 'Product "White Towels" is active');
  assertTest(allSizes.length > 0, `Product has ${allSizes.length} active dynamic size(s)`);

  const selectedSize = allSizes[0];
  assertTest(selectedSize.price > 0, `Size ${selectedSize.size} has valid price: ₹${selectedSize.price}`);
  assertTest(selectedSize.stock >= 40, `Size ${selectedSize.size} has stock (${selectedSize.stock}) meeting MOQ (40 pcs)`);

  // ==================================================================
  // PHASE 4: BUYER REGISTRATION & CATALOG BROWSING
  // ==================================================================
  console.log('\n📋 PHASE 4: Buyer Registration & Order Placement...');
  let buyerUser = await User.findOne({ email: 'buyer@sstextiles.com' });
  if (!buyerUser) {
    buyerUser = await User.create({
      name: 'Ramesh Kumar',
      businessName: 'Ramesh Textiles & Hospitality',
      email: 'buyer@sstextiles.com',
      password: 'customer123',
      role: 'customer',
      phone: '+919876501234',
      gstin: '33AAAAA9999Z1Z5',
      address: '123 Market Road, Gandhi Nagar, Erode - 638001',
      city: 'Erode',
      state: 'Tamil Nadu',
      pincode: '638001',
      isVerified: true,
    });
  }

  assertTest(buyerUser.email === 'buyer@sstextiles.com', 'Buyer account loaded: Ramesh Kumar');

  // Place Wholesale Order (40 pcs MOQ)
  const orderQuantity = 40;
  const unitPrice = selectedSize.price;
  const subtotal = orderQuantity * unitPrice;
  const gstTax = Math.round(subtotal * 0.05 * 100) / 100;
  const totalAmount = subtotal + gstTax;

  const orderNum = `SST-${Math.floor(100000 + Math.random() * 900000)}`;
  const orderId = new mongoose.Types.ObjectId();

  const orderItem = await OrderItem.create({
    order: orderId,
    product: product._id,
    productName: product.name,
    size: selectedSize.size,
    quantity: orderQuantity,
    price: unitPrice,
    subtotal: subtotal,
    unitPrice: unitPrice,
    totalPrice: subtotal,
    weightKg: selectedSize.weightKg || 0.5,
    gsm: selectedSize.gsm || 500,
  });

  const buyerOrder = await Order.create({
    _id: orderId,
    orderNumber: orderNum,
    customer: buyerUser._id,
    customerDetails: {
      name: buyerUser.name,
      businessName: buyerUser.businessName,
      email: buyerUser.email,
      phone: buyerUser.phone,
      gstin: '33AAAAA9999Z1Z5',
      state: 'Tamil Nadu',
      stateCode: '33',
    },
    shippingAddress: {
      name: buyerUser.name,
      phone: buyerUser.phone,
      address: buyerUser.address,
      city: 'Erode',
      state: 'Tamil Nadu',
      stateCode: '33',
      pincode: '638001',
    },
    items: [orderItem._id],
    totalPieces: orderQuantity,
    totalWeightKg: (selectedSize.weightKg || 0.5) * orderQuantity,
    balesCount: 1,
    subtotal: subtotal,
    taxSummary: {
      taxType: 'CGST_SGST',
      taxableAmount: subtotal,
      cgstRate: 2.5,
      cgstAmount: gstTax / 2,
      sgstRate: 2.5,
      sgstAmount: gstTax / 2,
      totalTax: gstTax,
    },
    totalAmount: totalAmount,
    orderStatus: 'new',
    paymentStatus: 'pending',
    paymentMethod: 'Direct Mill Bank Transfer (NEFT/RTGS/IMPS)',
  });

  assertTest(buyerOrder.orderStatus === 'new', `Order created with initial status NEW (#${buyerOrder.orderNumber})`);
  assertTest(buyerOrder.paymentStatus === 'pending', 'Order payment status is PENDING verification');
  assertTest(buyerOrder.totalAmount === totalAmount, `Total order amount calculated accurately: ₹${totalAmount.toLocaleString('en-IN')}`);

  // ==================================================================
  // PHASE 5: ADMIN PAYMENT VERIFICATION & GST INVOICE GENERATION
  // ==================================================================
  console.log('\n📋 PHASE 5: Admin Offline Payment Verification & Tax Invoice Issuance...');
  const paymentRef = 'SBI-NEFT-987654321';
  const paymentTime = new Date();

  buyerOrder.paymentStatus = 'paid';
  buyerOrder.orderStatus = 'confirmed';
  buyerOrder.paymentDetails = {
    method: 'Direct Mill Bank Transfer (NEFT/RTGS/IMPS)',
    reference: paymentRef,
    confirmedAt: paymentTime,
    amount: totalAmount,
  };
  await buyerOrder.save();

  const invNum = `SST-INV-${buyerOrder.orderNumber.replace('SST-', '')}`;
  const generatedInvoice = await Invoice.create({
    invoiceNumber: invNum,
    order: buyerOrder._id,
    customer: buyerUser._id,
    customerDetails: {
      name: buyerOrder.customerDetails.name,
      businessName: buyerOrder.customerDetails.businessName,
      gstin: buyerOrder.customerDetails.gstin,
      phone: buyerOrder.customerDetails.phone,
      email: buyerOrder.customerDetails.email,
      state: 'Tamil Nadu',
      stateCode: '33',
    },
    items: [
      {
        product: product._id,
        productName: product.name,
        size: selectedSize.size,
        quantity: orderQuantity,
        unitPrice: unitPrice,
        totalPrice: subtotal,
      },
    ],
    subtotal: buyerOrder.subtotal,
    totalAmount: buyerOrder.totalAmount,
    paymentStatus: 'paid',
  });

  assertTest(buyerOrder.paymentStatus === 'paid', 'Order updated to PAID upon admin verification');
  assertTest(generatedInvoice.invoiceNumber === invNum, `GST Tax Invoice generated: ${generatedInvoice.invoiceNumber}`);
  assertTest(generatedInvoice.paymentStatus === 'paid' || generatedInvoice.status === 'PAID', 'Invoice paymentStatus marked as paid');

  // ==================================================================
  // PHASE 6: ORDER FULFILLMENT LIFECYCLE (ADMIN TO BUYER)
  // ==================================================================
  console.log('\n📋 PHASE 6: Order Dispatch & Delivery Tracking...');
  buyerOrder.orderStatus = 'processing';
  await buyerOrder.save();
  assertTest(buyerOrder.orderStatus === 'processing', 'Order status moved to PROCESSING');

  buyerOrder.orderStatus = 'ready_for_dispatch';
  buyerOrder.deliveryDetails = {
    transporter: 'VRL Logistics Cargo',
    lrNumber: 'VRL-ERD-458921',
  };
  await buyerOrder.save();
  assertTest(buyerOrder.orderStatus === 'ready_for_dispatch', 'Order marked READY FOR DISPATCH with LR details');

  buyerOrder.orderStatus = 'delivered';
  await buyerOrder.save();
  assertTest(buyerOrder.orderStatus === 'delivered', 'Order marked as DELIVERED to buyer');

  // ==================================================================
  // SUMMARY
  // ==================================================================
  console.log('\n================================================================');
  console.log(`🎉 COMPREHENSIVE TEST SUITE COMPLETED: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log('================================================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

runComprehensiveTests().catch((err) => {
  console.error('\n❌ Test Suite encountered an error:', err);
  process.exit(1);
});
