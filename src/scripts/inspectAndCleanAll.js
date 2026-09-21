import mongoose from 'mongoose';
import { User, Product, Size, Order, OrderItem, Invoice } from '../models/index.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gowtham_tex';

async function inspectAndClean() {
  await mongoose.connect(MONGODB_URI);
  console.log('\n========================================================');
  console.log('🔍 CURRENT MONGODB STATE:');
  console.log('========================================================');

  const users = await User.find().lean();
  console.log(`\n👥 USERS (${users.length}):`);
  users.forEach((u) => console.log(` - [${u._id}] ${u.name} | ${u.email} | Role: ${u.role}`));

  const products = await Product.find().lean();
  console.log(`\n📦 PRODUCTS (${products.length}):`);
  for (const p of products) {
    const sizes = await Size.find({ product: p._id }).lean();
    console.log(` - [${p._id}] ${p.name} | Active: ${p.active} | Sizes: ${sizes.length} (${sizes.map((s) => s.size).join(', ')})`);
  }

  const sizes = await Size.find().lean();
  console.log(`\n📏 SIZES (${sizes.length}):`);
  sizes.forEach((s) => console.log(` - [${s._id}] Prod: ${s.product} | Size: ${s.size} | Price: ₹${s.price} | Stock: ${s.stock} | Active: ${s.active}`));

  const orders = await Order.find().lean();
  console.log(`\n🛒 ORDERS (${orders.length}):`);
  orders.forEach((o) => console.log(` - [${o._id}] #${o.orderNumber} | Buyer: ${o.customerDetails?.name || o.customerDetails?.businessName} | Status: ${o.orderStatus}/${o.paymentStatus} | Total: ₹${o.totalAmount}`));

  const invoices = await Invoice.find().lean();
  console.log(`\n🧾 INVOICES (${invoices.length}):`);
  invoices.forEach((i) => console.log(` - [${i._id}] #${i.invoiceNumber} | Order: ${i.order} | Total: ₹${i.totalAmount}`));

  console.log('\n========================================================\n');
  await mongoose.disconnect();
}

inspectAndClean().catch((err) => {
  console.error(err);
  process.exit(1);
});
