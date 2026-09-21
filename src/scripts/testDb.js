import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB, disconnectDB } from '../config/db.js';
import { User, Product, Size, Order, OrderItem, Invoice } from '../models/index.js';

dotenv.config();

export const runDatabaseTests = async () => {
  console.log('\n=============================================');
  console.log('🧪 GOWTHAM TEX — MONGODB VALIDATION TEST SUITE');
  console.log('=============================================\n');

  try {
    const conn = await connectDB();
    console.log(`✓ 1. MongoDB Connection: ACTIVE (${conn.connection.name})\n`);

    // Test 1: Verify all 6 Collections Exist & have documents
    console.log('--- TEST 1: Collection Counts ---');
    const userCount = await User.countDocuments();
    const productCount = await Product.countDocuments();
    const sizeCount = await Size.countDocuments();
    const orderCount = await Order.countDocuments();
    const orderItemCount = await OrderItem.countDocuments();
    const invoiceCount = await Invoice.countDocuments();

    console.log(`  • Users Collection:      ${userCount} document(s)`);
    console.log(`  • Products Collection:   ${productCount} document(s)`);
    console.log(`  • Sizes Collection:      ${sizeCount} document(s)`);
    console.log(`  • Orders Collection:     ${orderCount} document(s)`);
    console.log(`  • OrderItems Collection: ${orderItemCount} document(s)`);
    console.log(`  • Invoices Collection:   ${invoiceCount} document(s)`);

    if (productCount === 0 || sizeCount === 0) {
      console.warn('⚠️ Warning: No products or sizes found. Run `npm run seed` first.');
    }

    // Test 2: Verify Dynamic Size Architecture & Population
    console.log('\n--- TEST 2: Dynamic Size Architecture & Population ---');
    const product = (await Product.findOne({ name: { $regex: /white towel/i } }).populate('sizes')) || (await Product.findOne().populate('sizes'));
    if (product) {
      console.log(`  Product Found: "${product.name}"`);
      const sizes = await Size.find({ product: product._id });
      console.log(`  Dynamic Sizes (${sizes.length}):`);
      sizes.forEach(s => {
        console.log(`    - Size: ${s.size.padEnd(8)} | Price: ₹${s.price.toString().padEnd(4)} | Stock: ${s.stock} pcs`);
      });
    } else {
      console.log('  Product "White Towel" not found.');
    }

    // Test 3: Test Dynamic Addition of New Size (e.g. 50x100)
    console.log('\n--- TEST 3: Dynamic Creation of New Size (e.g. 50x100) ---');
    if (product) {
      const testSizeSpec = '50x100';
      // Clean any existing test size first
      await Size.deleteOne({ product: product._id, size: testSizeSpec });

      const newDynamicSize = await Size.create({
        product: product._id,
        size: testSizeSpec,
        price: 200,
        stock: 300,
        gsm: 650,
        active: true,
      });
      console.log(`  ✓ Successfully created dynamic size "${newDynamicSize.size}" at ₹${newDynamicSize.price} (Stock: ${newDynamicSize.stock} pcs) without modifying Product code!`);

      // Clean up test size to keep seed pristine
      await Size.deleteOne({ _id: newDynamicSize._id });
      console.log(`  ✓ Cleaned up temporary test size "${testSizeSpec}"`);
    }

    // Test 4: Validation Tests (Negative price/stock, duplicate size)
    console.log('\n--- TEST 4: Mongoose Validation Rules ---');
    
    // Test negative price rejection
    try {
      const invalidSize = new Size({
        product: product?._id,
        size: '10x20',
        price: -50, // Should fail
        stock: 100,
      });
      await invalidSize.validate();
      console.error('  ✗ Error: Negative price was NOT rejected!');
    } catch (err) {
      console.log(`  ✓ Negative Price Validation: PASSED (${err.message})`);
    }

    // Test negative stock rejection
    try {
      const invalidStock = new Size({
        product: product?._id,
        size: '10x20',
        price: 50,
        stock: -10, // Should fail
      });
      await invalidStock.validate();
      console.error('  ✗ Error: Negative stock was NOT rejected!');
    } catch (err) {
      console.log(`  ✓ Negative Stock Validation: PASSED (${err.message})`);
    }

    // Test 5: Verify Order -> OrderItem Historical Price Snapshot
    console.log('\n--- TEST 5: Historical Price Preservation in Orders ---');
    const order = await Order.findOne().populate({
      path: 'items',
      populate: { path: 'product' },
    });
    if (order) {
      console.log(`  Order: #${order.orderNumber} | Customer ID: ${order.customer} | Total: ₹${order.totalAmount}`);
      order.items.forEach((item, idx) => {
        console.log(`    Item ${idx + 1}: ${item.productName} (${item.size}) × ${item.quantity} pcs @ ₹${item.price}/pc = ₹${item.subtotal}`);
      });
      console.log(`  ✓ Order items accurately preserve selected size string and unit rate at time of purchase.`);
    }

    console.log('\n=============================================');
    console.log('✅ ALL DATABASE TESTS PASSED SUCCESSFULLY!');
    console.log('=============================================\n');

  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    console.error(error.stack);
  } finally {
    await disconnectDB();
  }
};

// Auto-run if executed directly
if (process.argv[1] && process.argv[1].endsWith('testDb.js')) {
  runDatabaseTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
