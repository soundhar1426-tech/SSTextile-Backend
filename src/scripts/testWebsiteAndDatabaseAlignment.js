import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { User, Product, Size, Settings } from '../models/index.js';
import { getPublicProducts } from '../controllers/customerProductController.js';
import { getAdminProducts } from '../controllers/productController.js';
import { getSettings } from '../controllers/settingsController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gowtham_tex';

async function verifyAlignment() {
  console.log('================================================================');
  console.log('🧪 SSTextiles — WEBSITE & DATABASE ALIGNMENT VERIFICATION');
  console.log('================================================================\n');

  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to MongoDB.\n');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  }

  // 1. Verify Mill Settings
  console.log('📋 STEP 1: Verifying Mill Settings & Invoicing Metadata...');
  let settingsRes = null;
  const mockSettingsRes = {
    status: (code) => ({
      json: (data) => {
        settingsRes = { code, ...data };
        return settingsRes;
      },
    }),
  };
  await getSettings({}, mockSettingsRes);

  const s = settingsRes.settings;
  console.log(`   • Mill Name:    ${s.name}`);
  console.log(`   • Mill GSTIN:   ${s.gstin}`);
  console.log(`   • Phone:        ${s.phone}`);
  console.log(`   • Bank:         ${s.bankDetails?.bankName} (A/c: ${s.bankDetails?.accountNumber})`);

  if (s.name !== 'SSTextiles' || s.gstin !== '33AAAAA0000A1Z5' || s.bankDetails?.accountNumber !== '30001234567') {
    console.error('   ❌ FAIL: Mill settings are misaligned!');
    process.exit(1);
  }
  console.log('   ✅ PASS: Mill settings match 100%.\n');

  // 2. Verify Product Alignment between Customer API and Admin API
  console.log('📋 STEP 2: Verifying Product & Specifications Alignment...');
  let publicRes = null;
  const mockPubRes = {
    status: (code) => ({
      json: (data) => {
        publicRes = { code, ...data };
        return publicRes;
      },
    }),
  };
  await getPublicProducts({}, mockPubRes);

  let adminRes = null;
  const mockAdminRes = {
    status: (code) => ({
      json: (data) => {
        adminRes = { code, ...data };
        return adminRes;
      },
    }),
  };
  await getAdminProducts({}, mockAdminRes);

  const pubProd = publicRes.products[0];
  const admProd = adminRes.products[0];

  console.log(`   • Customer API Product: "${pubProd.name}" (${pubProd.material} | ${pubProd.weaveType})`);
  console.log(`   • Admin API Product:    "${admProd.name}" (${admProd.material} | ${admProd.weaveType})`);

  if (pubProd.name !== admProd.name || pubProd.material !== admProd.material || pubProd.weaveType !== admProd.weaveType) {
    console.error('   ❌ FAIL: Product specifications misaligned between customer and admin!');
    process.exit(1);
  }
  console.log('   ✅ PASS: Product specifications aligned.\n');

  // 3. Verify Dynamic Sizes Alignment
  console.log('📋 STEP 3: Verifying All 9 Dynamic Sizes Alignment...');
  console.log(`   • Total sizes in public API: ${pubProd.sizes.length}`);
  console.log(`   • Total sizes in admin API:  ${admProd.sizes.length}`);

  if (pubProd.sizes.length !== 9 || admProd.sizes.length !== 9) {
    console.error(`   ❌ FAIL: Expected 9 dynamic sizes, got ${pubProd.sizes.length}`);
    process.exit(1);
  }

  const expectedSizes = [
    { size: '20x40', price: 60, stock: 600, grams: 36 },
    { size: '25x50', price: 80, stock: 500, grams: 63 },
    { size: '30x60', price: 120, stock: 750, grams: 99 },
    { size: '35x70', price: 140, stock: 450, grams: 135 },
    { size: '40x80', price: 160, stock: 400, grams: 192 },
    { size: '50x100', price: 220, stock: 350, grams: 300 },
    { size: '70x140', price: 380, stock: 300, grams: 637 },
    { size: '75x150', price: 420, stock: 250, grams: 731 },
    { size: '80x160', price: 480, stock: 200, grams: 896 },
  ];

  for (const exp of expectedSizes) {
    const pubSize = pubProd.sizes.find((s) => s.size === exp.size);
    const admSize = admProd.sizes.find((s) => s.size === exp.size);

    if (!pubSize || !admSize) {
      console.error(`   ❌ FAIL: Size ${exp.size} missing in API!`);
      process.exit(1);
    }

    if (pubSize.price !== exp.price || pubSize.stock !== exp.stock || pubSize.grams !== exp.grams) {
      console.error(`   ❌ FAIL: Size ${exp.size} data mismatch! Expected: ₹${exp.price}, ${exp.stock} pcs, ${exp.grams}g. Got: ₹${pubSize.price}, ${pubSize.stock} pcs, ${pubSize.grams}g`);
      process.exit(1);
    }
    console.log(`   ✅ Size ${exp.size} cm: ₹${pubSize.price}/pc | ${pubSize.grams}g | Stock: ${pubSize.stock} pcs`);
  }

  console.log('\n================================================================');
  console.log('🎉 100% DATA ALIGNMENT VERIFIED ACROSS WEBSITE & DATABASE');
  console.log('================================================================\n');

  process.exit(0);
}

verifyAlignment();
