import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { User, Product, Size, Order, OrderItem, Invoice } from '../models/index.js';

dotenv.config();

export const cleanDuplicates = async () => {
  try {
    console.log('========================================================');
    console.log('🧹 GOWTHAM TEX — DATABASE CLEANUP & DEDUPLICATION');
    console.log('========================================================\n');

    await connectDB();

    // 1. Remove duplicate and test users
    console.log('--> 1. Checking for duplicate or test users...');
    const allUsers = await User.find().sort({ createdAt: -1 });
    console.log(`Found ${allUsers.length} total user records.`);

    const seenEmails = new Set();
    const seenPhones = new Set();
    const usersToDelete = [];
    const usersToKeep = [];

    for (const user of allUsers) {
      const email = (user.email || '').toLowerCase().trim();
      const phone = (user.phone || '').replace(/[^0-9]/g, '');

      // Check if test user created by automated test scripts
      const isTestUser = email.includes('customer8_') || email.includes('temp_') || (email.includes('test') && email !== 'admin@gowthamtex.com');

      if (isTestUser) {
        usersToDelete.push(user._id);
        console.log(`  🗑️ Removing test user: ${user.name} (${user.email}) [${user._id}]`);
        continue;
      }

      if (seenEmails.has(email) || (phone && seenPhones.has(phone))) {
        usersToDelete.push(user._id);
        console.log(`  🗑️ Removing duplicate user: ${user.name} (${user.email} / ${user.phone}) [${user._id}]`);
      } else {
        if (email) seenEmails.add(email);
        if (phone) seenPhones.add(phone);
        usersToKeep.push(user);
        console.log(`  ✓ Keeping unique user: ${user.name} (${user.email}) [Role: ${user.role}]`);
      }
    }

    if (usersToDelete.length > 0) {
      await User.deleteMany({ _id: { $in: usersToDelete } });
      console.log(`  ✨ Deleted ${usersToDelete.length} duplicate/test user records.\n`);
    } else {
      console.log('  ✨ No duplicate users found.\n');
    }

    // 2. Remove duplicate products & orphaned sizes
    console.log('--> 2. Checking for duplicate products...');
    const allProducts = await Product.find().sort({ createdAt: 1 });
    console.log(`Found ${allProducts.length} total product records.`);

    const seenProductNames = new Set();
    const productsToDelete = [];

    for (const prod of allProducts) {
      const prodName = (prod.name || '').toLowerCase().trim();
      if (seenProductNames.has(prodName)) {
        productsToDelete.push(prod._id);
        console.log(`  🗑️ Removing duplicate product: ${prod.name} [${prod._id}]`);
      } else {
        seenProductNames.add(prodName);
        console.log(`  ✓ Keeping unique product: ${prod.name} [${prod._id}]`);
      }
    }

    if (productsToDelete.length > 0) {
      await Size.deleteMany({ product: { $in: productsToDelete } });
      await Product.deleteMany({ _id: { $in: productsToDelete } });
      console.log(`  ✨ Deleted ${productsToDelete.length} duplicate products and associated sizes.\n`);
    } else {
      console.log('  ✨ No duplicate products found.\n');
    }

    // 3. Remove duplicate sizes per product & orphaned sizes
    console.log('--> 3. Checking for duplicate & orphaned sizes...');
    const existingProductIds = (await Product.find({}, '_id')).map((p) => p._id.toString());
    const allSizes = await Size.find().sort({ createdAt: 1 });

    const seenProductSizes = new Set();
    const sizesToDelete = [];

    for (const sizeDoc of allSizes) {
      const prodIdStr = sizeDoc.product ? sizeDoc.product.toString() : null;

      // Orphan check
      if (!prodIdStr || !existingProductIds.includes(prodIdStr)) {
        sizesToDelete.push(sizeDoc._id);
        console.log(`  🗑️ Removing orphaned size: ${sizeDoc.size} [${sizeDoc._id}]`);
        continue;
      }

      // Duplicate dimension check per product
      const normalizedDimension = (sizeDoc.size || '').toLowerCase().replace(/\s+/g, '').replace('×', 'x');
      const compositeKey = `${prodIdStr}_${normalizedDimension}`;

      if (seenProductSizes.has(compositeKey)) {
        sizesToDelete.push(sizeDoc._id);
        console.log(`  🗑️ Removing duplicate size: ${sizeDoc.size} for product [${prodIdStr}]`);
      } else {
        seenProductSizes.add(compositeKey);
      }
    }

    if (sizesToDelete.length > 0) {
      await Size.deleteMany({ _id: { $in: sizesToDelete } });
      console.log(`  ✨ Deleted ${sizesToDelete.length} duplicate/orphaned sizes.\n`);
    } else {
      console.log('  ✨ No duplicate sizes found.\n');
    }

    // 4. Remove duplicate and test orders
    console.log('--> 4. Checking for duplicate or test orders...');
    const allOrders = await Order.find().sort({ createdAt: -1 });
    console.log(`Found ${allOrders.length} total order records.`);

    const seenOrderNumbers = new Set();
    const ordersToDelete = [];

    for (const order of allOrders) {
      const orderNum = (order.orderNumber || '').toUpperCase().trim();
      const isTestOrder =
        order.customerDetails?.email?.includes('customer8_') ||
        order.customerDetails?.email?.includes('temp_');

      if (isTestOrder) {
        ordersToDelete.push(order._id);
        console.log(`  🗑️ Removing test order: #${order.orderNumber || order._id}`);
        continue;
      }

      if (seenOrderNumbers.has(orderNum) && orderNum !== '') {
        ordersToDelete.push(order._id);
        console.log(`  🗑️ Removing duplicate order number: #${order.orderNumber} [${order._id}]`);
      } else {
        if (orderNum) seenOrderNumbers.add(orderNum);
        console.log(`  ✓ Keeping legitimate order: #${order.orderNumber} (${order.customerDetails?.businessName || order.customerDetails?.name})`);
      }
    }

    if (ordersToDelete.length > 0) {
      await OrderItem.deleteMany({ order: { $in: ordersToDelete } });
      await Invoice.deleteMany({ order: { $in: ordersToDelete } });
      await Order.deleteMany({ _id: { $in: ordersToDelete } });
      console.log(`  ✨ Deleted ${ordersToDelete.length} duplicate/test order records and their line items.\n`);
    } else {
      console.log('  ✨ No duplicate orders found.\n');
    }

    // 5. Clean up duplicate & orphaned Invoices
    console.log('--> 5. Checking for duplicate & orphaned Invoices...');
    const currentOrderIds = (await Order.find({}, '_id')).map((o) => o._id.toString());
    const allInvoices = await Invoice.find().sort({ createdAt: -1 });

    const seenInvoiceNumbers = new Set();
    const seenOrderInvoices = new Set();
    const invoicesToDelete = [];

    for (const inv of allInvoices) {
      const invNum = (inv.invoiceNumber || '').toUpperCase().trim();
      const ordIdStr = inv.order ? inv.order.toString() : null;

      if (!ordIdStr || !currentOrderIds.includes(ordIdStr)) {
        invoicesToDelete.push(inv._id);
        console.log(`  🗑️ Removing orphaned invoice: #${inv.invoiceNumber}`);
        continue;
      }

      if (seenInvoiceNumbers.has(invNum) || seenOrderInvoices.has(ordIdStr)) {
        invoicesToDelete.push(inv._id);
        console.log(`  🗑️ Removing duplicate invoice: #${inv.invoiceNumber} for order [${ordIdStr}]`);
      } else {
        if (invNum) seenInvoiceNumbers.add(invNum);
        seenOrderInvoices.add(ordIdStr);
      }
    }

    if (invoicesToDelete.length > 0) {
      await Invoice.deleteMany({ _id: { $in: invoicesToDelete } });
      console.log(`  ✨ Deleted ${invoicesToDelete.length} duplicate/orphaned invoices.\n`);
    } else {
      console.log('  ✨ No duplicate invoices found.\n');
    }

    // 6. Clean up orphaned OrderItems
    console.log('--> 6. Checking for orphaned OrderItems...');
    const orphanedItemsResult = await OrderItem.deleteMany({ order: { $nin: currentOrderIds } });
    if (orphanedItemsResult.deletedCount > 0) {
      console.log(`  ✨ Cleaned up ${orphanedItemsResult.deletedCount} orphaned OrderItem records.\n`);
    } else {
      console.log('  ✨ No orphaned OrderItems found.\n');
    }

    // 7. Final Summary
    const finalUserCount = await User.countDocuments();
    const finalProductCount = await Product.countDocuments();
    const finalSizeCount = await Size.countDocuments();
    const finalOrderCount = await Order.countDocuments();
    const finalInvoiceCount = await Invoice.countDocuments();

    console.log('========================================================');
    console.log('📊 DATABASE CLEANUP COMPLETE - SUMMARY:');
    console.log(`   • Total Users:    ${finalUserCount}`);
    console.log(`   • Total Products: ${finalProductCount}`);
    console.log(`   • Total Sizes:    ${finalSizeCount}`);
    console.log(`   • Total Orders:   ${finalOrderCount}`);
    console.log(`   • Total Invoices: ${finalInvoiceCount}`);
    console.log('========================================================\n');

    await mongoose.connection.close();
    return {
      users: finalUserCount,
      products: finalProductCount,
      sizes: finalSizeCount,
      orders: finalOrderCount,
      invoices: finalInvoiceCount,
    };
  } catch (err) {
    console.error('[Clean Duplicates Error]', err);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    throw err;
  }
};

if (process.argv[1] && process.argv[1].endsWith('cleanDuplicates.js')) {
  cleanDuplicates()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
