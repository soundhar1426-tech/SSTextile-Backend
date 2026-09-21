import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { User, Product, Size, Order, OrderItem, Invoice, Settings } from '../models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gowtham_tex';

const canonicalProducts = [
  {
    name: 'White Towels',
    description: 'Direct Weaving Mill 100% Combed Ringspun Cotton Plain White Terry Towels. Double needle hemmed, fast-absorb yarn for bulk wholesale ordering.',
    category: 'White Towels',
    material: '100% Combed Ringspun Cotton',
    weaveType: '2/20s Ring Spun',
    hsnCode: '6302.60',
    active: true,
    images: [
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCCdKqsvfuy2yau3AySGBI8zrrt1U9ghlW3X5wsoSzGBmztb7AyEZEhYV6EL6hsHNIBYMWtdL482GVLBRWvqbV0yTmpIlrmoJph838qaVWq9l1eDuxkE1I__-yKdS3oaLCCRrHpvWejMDeHWnT87rkOyHa0EKZu56Gbw6hoaMcb3hM9wIo5pCxDGGx6g7JtSEJY9wy9ZOXaAhzH4nphAIFBcgFZ6Bb85_5NECSf6XaYsx6x0NyYuSCwXw',
    ],
    sizes: [
      { size: '20x40', price: 60, stock: 600, gsm: 450, grams: 36, weightKg: 0.036 },
      { size: '25x50', price: 80, stock: 500, gsm: 500, grams: 63, weightKg: 0.063 },
      { size: '30x60', price: 120, stock: 750, gsm: 550, grams: 99, weightKg: 0.099 },
      { size: '35x70', price: 140, stock: 450, gsm: 550, grams: 135, weightKg: 0.135 },
      { size: '40x80', price: 160, stock: 400, gsm: 600, grams: 192, weightKg: 0.192 },
      { size: '50x100', price: 220, stock: 350, gsm: 600, grams: 300, weightKg: 0.300 },
      { size: '70x140', price: 380, stock: 300, gsm: 650, grams: 637, weightKg: 0.637 },
      { size: '75x150', price: 420, stock: 250, gsm: 650, grams: 731, weightKg: 0.731 },
      { size: '80x160', price: 480, stock: 200, gsm: 700, grams: 896, weightKg: 0.896 },
    ],
  },
];

async function cleanAndResetAllData() {
  console.log('\n========================================================');
  console.log('🧹 SSTextiles — COMPLETE DATABASE DEDUPLICATION & CLEANUP');
  console.log('========================================================\n');

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('Connected to MongoDB.');
  } catch (err) {
    console.log('Notice: Connecting to local mongo fallback...');
    await mongoose.connect('mongodb://127.0.0.1:27017/gowtham_tex');
  }

  // 1. Clean Products & Sizes
  console.log('--> 1. Cleaning all duplicate and fragmented products/sizes...');
  await Product.deleteMany({});
  await Size.deleteMany({});
  console.log('  ✓ Old products and sizes removed.');

  // 2. Seed pristine canonical products and sizes
  console.log('--> 2. Seeding clean canonical towel catalog (1 product, 9 unique sizes)...');
  for (const pData of canonicalProducts) {
    const { sizes, ...prodInfo } = pData;
    const product = await Product.create(prodInfo);
    
    for (const sizeInfo of sizes) {
      await Size.create({
        product: product._id,
        ...sizeInfo,
        active: true,
      });
    }
    console.log(`  ✓ Created clean product: "${product.name}" with ${sizes.length} unique dynamic sizes.`);
  }

  // 3. Clean and ensure pristine Users
  console.log('\n--> 3. Ensuring pristine canonical users...');
  await User.deleteMany({});

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
    address: '123 Textile Park, Perundurai Road, Erode - 638052, Tamil Nadu, India',
    isVerified: true,
  });
  console.log(`  ✓ Created Admin: ${admin.email} / admin123 (Phone: ${admin.phone})`);

  const customer = await User.create({
    name: 'K. Rajendran',
    businessName: 'Surya Hotels & Resorts',
    email: 'buyer@sstextiles.com',
    password: 'customer123',
    role: 'customer',
    phone: '+919876501234',
    gstin: '33AAAAA9999Z1Z5',
    city: 'Erode',
    state: 'Tamil Nadu',
    pincode: '638001',
    address: '142 Brough Road, Near Railway Station Junction',
    isVerified: true,
  });
  console.log(`  ✓ Created Customer: ${customer.email} / customer123 (Phone: ${customer.phone})`);

  // 4. Clean duplicate and orphaned settings
  console.log('\n--> 4. Resetting Mill Settings to SSTextiles defaults...');
  await Settings.deleteMany({});
  await Settings.create({
    name: 'SSTextiles',
    tagline: 'Direct-from-Mill Wholesale Terry Towel Consignments',
    deityText: 'SHIVAM',
    gstin: '33AAAAA0000A1Z5',
    pan: 'AAAAA0000A',
    stateCode: '33',
    phone: '98765 43210, 98765 43211',
    email: 'admin@sstextiles.com',
    address: '123 Textile Park, Perundurai Road, Erode - 638052, Tamil Nadu, India',
    bankDetails: {
      accountName: 'SSTextiles',
      bankName: 'State Bank of India',
      branch: 'Erode Main Branch',
      accountNumber: '30001234567',
      ifsc: 'SBIN0001234',
    },
    isDefault: true,
  });
  console.log('  ✓ Mill Settings initialized cleanly.');

  // 5. Clean duplicate orders and invoices
  console.log('\n--> 5. Deduplicating and resetting test orders/invoices...');
  await Order.deleteMany({});
  await OrderItem.deleteMany({});
  await Invoice.deleteMany({});
  console.log('  ✓ Orders and Invoices reset cleanly.');

  const totalProducts = await Product.countDocuments();
  const totalSizes = await Size.countDocuments();
  const totalUsers = await User.countDocuments();
  const totalOrders = await Order.countDocuments();

  console.log('\n========================================================');
  console.log('✨ CLEAN DATABASE STATE:');
  console.log(`   • Products in Catalog:  ${totalProducts} unique product(s)`);
  console.log(`   • Dynamic Sizes:        ${totalSizes} active size options`);
  console.log(`   • Clean Users:          ${totalUsers} (Admin & Customer)`);
  console.log(`   • Orders:               ${totalOrders}`);
  console.log('========================================================\n');

  await mongoose.disconnect();
}

cleanAndResetAllData().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
