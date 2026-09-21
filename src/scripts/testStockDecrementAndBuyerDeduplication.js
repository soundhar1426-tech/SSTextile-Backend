import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { User, Product, Size, Order, OrderItem, Invoice, Settings } from '../models/index.js';
import { createOrder } from '../controllers/orderController.js';
import { getAdminCustomers } from '../controllers/adminOrderController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gowtham_tex';

async function runStockAndBuyerVerification() {
  console.log('================================================================');
  console.log('🧪 SSTextiles — STOCK DECREMENT & BUYER DEDUPLICATION TEST SUITE');
  console.log('================================================================\n');

  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to MongoDB.\n');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  }

  // 1. Clean and reset database to clean canonical state
  console.log('📋 STEP 1: Ensuring Clean Database State...');
  await User.deleteMany({});
  await Product.deleteMany({});
  await Size.deleteMany({});
  await Order.deleteMany({});
  await OrderItem.deleteMany({});
  await Invoice.deleteMany({});

  const admin = await User.create({
    name: 'SSTextiles Mill Admin',
    businessName: 'SSTextiles',
    email: 'admin@sstextiles.com',
    password: 'admin123',
    role: 'admin',
    phone: '+919876543210',
    city: 'Erode',
    state: 'Tamil Nadu',
    pincode: '638052',
    isVerified: true,
  });

  const buyer = await User.create({
    name: 'Ramesh Kumar',
    businessName: 'Surya Grand Hospitality',
    email: 'buyer@sstextiles.com',
    password: 'customer123',
    role: 'customer',
    phone: '+919876501234',
    gstin: '33AAAAA9999Z1Z5',
    city: 'Erode',
    state: 'Tamil Nadu',
    pincode: '638001',
    address: '142 Brough Road, Erode',
    isVerified: true,
  });

  const product = await Product.create({
    name: 'White Towels',
    description: 'Direct Weaving Mill 100% Combed Ringspun Cotton Plain White Terry Towels',
    category: 'White Towels',
    hsnCode: '6302.60',
    material: 'Cotton',
    weaveType: '2/20s Ring Spun',
    active: true,
    images: ['https://lh3.googleusercontent.com/aida-public/AB6AXuCCdKqsvfuy2yau3AySGBI8zrrt1U9ghlW3X5wsoSzGBmztb7AyEZEhYV6EL6hsHNIBYMWtdL482GVLBRWvqbV0yTmpIlrmoJph838qaVWq9l1eDuxkE1I__-yKdS3oaLCCRrHpvWejMDeHWnT87rkOyHa0EKZu56Gbw6hoaMcb3hM9wIo5pCxDGGx6g7JtSEJY9wy9ZOXaAhzH4nphAIFBcgFZ6Bb85_5NECSf6XaYsx6x0NyYuSCwXw'],
  });

  const size25x50 = await Size.create({
    product: product._id,
    size: '25x50',
    dimension: '25x50 cm',
    price: 80,
    stock: 500,
    gsm: 500,
    grams: 63,
    weightKg: 0.063,
    active: true,
  });

  const size30x60 = await Size.create({
    product: product._id,
    size: '30x60',
    dimension: '30x60 cm',
    price: 120,
    stock: 750,
    gsm: 550,
    grams: 99,
    weightKg: 0.099,
    active: true,
  });

  console.log('   ✅ Initial Stock: Size 25x50 = 500 pcs, Size 30x60 = 750 pcs\n');

  // 2. Test Buyer Purchase 1 (50 pcs of 25x50)
  console.log('📋 STEP 2: Placing Order 1 (50 pcs of 25x50 cm)...');
  const req1 = {
    user: buyer,
    body: {
      customerDetails: {
        name: buyer.name,
        businessName: buyer.businessName,
        phone: buyer.phone,
        email: buyer.email,
        gstin: buyer.gstin,
        state: 'Tamil Nadu',
        stateCode: '33',
      },
      deliveryDetails: {
        addressLine1: buyer.address,
        city: buyer.city,
        state: buyer.state,
        stateCode: '33',
        pincode: buyer.pincode,
        contactPhone: buyer.phone,
        transporter: 'VRL Logistics Cargo',
      },
      items: [
        {
          productId: product._id.toString(),
          productName: product.name,
          sizeId: size25x50._id.toString(),
          size: '25x50',
          quantity: 50,
        },
      ],
    },
  };

  let resData1 = null;
  const mockRes1 = {
    status: (code) => ({
      json: (data) => {
        resData1 = { code, ...data };
        return resData1;
      },
    }),
  };

  await createOrder(req1, mockRes1);

  if (!resData1 || !resData1.success) {
    console.error('   ❌ Order 1 creation failed:', resData1);
    process.exit(1);
  }

  // Verify stock in MongoDB after Order 1
  const updatedSize1 = await Size.findById(size25x50._id);
  console.log(`   ✅ PASS: Order 1 placed (#${resData1.order.orderNumber})`);
  console.log(`   ✅ PASS: Size 25x50 stock decremented: 500 -> ${updatedSize1.stock} (Expected: 450)`);

  if (updatedSize1.stock !== 450) {
    console.error(`   ❌ FAIL: Expected 450 stock, got ${updatedSize1.stock}`);
    process.exit(1);
  }

  // 3. Test Buyer Purchase 2 (60 pcs of 25x50 AND 100 pcs of 30x60)
  console.log('\n📋 STEP 3: Placing Order 2 (60 pcs of 25x50 AND 100 pcs of 30x60 cm)...');
  const req2 = {
    user: buyer,
    body: {
      customerDetails: {
        name: buyer.name,
        businessName: buyer.businessName,
        phone: buyer.phone,
        email: buyer.email,
        gstin: buyer.gstin,
        state: 'Tamil Nadu',
        stateCode: '33',
      },
      deliveryDetails: {
        addressLine1: buyer.address,
        city: buyer.city,
        state: buyer.state,
        stateCode: '33',
        pincode: buyer.pincode,
        contactPhone: buyer.phone,
        transporter: 'VRL Logistics Cargo',
      },
      items: [
        {
          productId: 'white-towels', // test string ID resolution
          productName: 'White Towels',
          sizeId: '25x50', // test string size resolution
          size: '25x50',
          quantity: 60,
        },
        {
          productId: product._id.toString(),
          productName: 'White Towels',
          sizeId: size30x60._id.toString(),
          size: '30x60',
          quantity: 100,
        },
      ],
    },
  };

  let resData2 = null;
  const mockRes2 = {
    status: (code) => ({
      json: (data) => {
        resData2 = { code, ...data };
        return resData2;
      },
    }),
  };

  await createOrder(req2, mockRes2);

  if (!resData2 || !resData2.success) {
    console.error('   ❌ Order 2 creation failed:', resData2);
    process.exit(1);
  }

  const updatedSize2_a = await Size.findById(size25x50._id);
  const updatedSize2_b = await Size.findById(size30x60._id);

  console.log(`   ✅ PASS: Order 2 placed (#${resData2.order.orderNumber})`);
  console.log(`   ✅ PASS: Size 25x50 stock decremented: 450 -> ${updatedSize2_a.stock} (Expected: 390)`);
  console.log(`   ✅ PASS: Size 30x60 stock decremented: 750 -> ${updatedSize2_b.stock} (Expected: 650)`);

  if (updatedSize2_a.stock !== 390 || updatedSize2_b.stock !== 650) {
    console.error('   ❌ FAIL: Stock numbers did not decrement accurately');
    process.exit(1);
  }

  // 4. Test Buyer Deduplication
  console.log('\n📋 STEP 4: Verifying Buyer Directory Deduplication...');
  let custRes = null;
  const mockCustRes = {
    status: (code) => ({
      json: (data) => {
        custRes = { code, ...data };
        return custRes;
      },
    }),
  };

  await getAdminCustomers({ query: {} }, mockCustRes);

  console.log(`   ✅ Total Buyers returned: ${custRes.customers.length}`);
  console.log(`   ✅ Buyer 1 Name: ${custRes.customers[0].name} (${custRes.customers[0].contactPerson})`);
  console.log(`   ✅ Buyer 1 Total POs: ${custRes.customers[0].totalOrdersCount} POs`);
  console.log(`   ✅ Buyer 1 Lifetime Volume: ${custRes.customers[0].lifetimeVolume}`);

  if (custRes.customers.length !== 1) {
    console.error(`   ❌ Duplicate buyers found! Expected 1, got ${custRes.customers.length}`);
    process.exit(1);
  }

  if (custRes.customers[0].totalOrdersCount !== 2) {
    console.error(`   ❌ Order count mismatch! Expected 2, got ${custRes.customers[0].totalOrdersCount}`);
    process.exit(1);
  }

  console.log('\n================================================================');
  console.log('🎉 ALL STOCK DECREMENT & BUYER DEDUPLICATION TESTS PASSED (100%)');
  console.log('================================================================\n');

  process.exit(0);
}

runStockAndBuyerVerification();
