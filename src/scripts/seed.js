import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB, disconnectDB } from '../config/db.js';
import { User, Product, Size, Order, OrderItem, Invoice } from '../models/index.js';

dotenv.config();

export const seedDatabase = async () => {
  try {
    console.log('\n=============================================');
    console.log('🚀 GOWTHAM TEX — MONGODB SEED SCRIPT');
    console.log('=============================================\n');

    await connectDB();

    // 1. Clear existing collections to ensure fresh seed
    console.log('[Seed] Clearing existing collections...');
    await Promise.all([
      User.deleteMany({}),
      Product.deleteMany({}),
      Size.deleteMany({}),
      Order.deleteMany({}),
      OrderItem.deleteMany({}),
      Invoice.deleteMany({}),
    ]);
    console.log('[Seed] Collections cleared successfully.');

    // 2. Create Sample Users
    console.log('[Seed] Creating sample users...');
    const adminUser = await User.create({
      name: 'Gowtham Tex Mill Admin',
      email: 'admin@gowthamtex.com',
      phone: '+91 98765 43210',
      password: 'admin123', // Hashed automatically by pre-save hook
      role: 'admin',
      address: 'Shed No. 14, Loom Industrial Cluster, Perundurai Road',
      city: 'Erode',
      state: 'Tamil Nadu',
      pincode: '638052',
      gstin: '33AAACG0184M1Z8',
    });

    const customerUser = await User.create({
      name: 'K. Rajendran',
      companyName: 'Surya Residency & Spas',
      email: 'procurement@suryahotels.com',
      phone: '+91 98421 55670',
      password: 'customer123', // Hashed automatically by pre-save hook
      role: 'customer',
      address: '142, Cotton Market Ring Rd, Industrial Estate',
      city: 'Erode',
      state: 'Tamil Nadu',
      pincode: '638001',
      gstin: '33AAACS9184M1Z8',
    });
    console.log(`[Seed] Created 2 users: Admin (${adminUser.email}), Customer (${customerUser.email})`);

    // 3. Create Products & Dynamic Sizes
    console.log('[Seed] Creating 3 comprehensive Towel Collections...');
    
    // Product 1: Pure White Terry Collection
    const p1 = await Product.create({
      name: 'Pure White Terry Collection',
      description: 'Institutional grade • Double needle hemmed • Fast-absorb yarn for hospitality, spas, and institutions.',
      images: [
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCCdKqsvfuy2yau3AySGBI8zrrt1U9ghlW3X5wsoSzGBmztb7AyEZEhYV6EL6hsHNIBYMWtdL482GVLBRWvqbV0yTmpIlrmoJph838qaVWq9l1eDuxkE1I__-yKdS3oaLCCRrHpvWejMDeHWnT87rkOyHa0EKZu56Gbw6hoaMcb3hM9wIo5pCxDGGx6g7JtSEJY9wy9ZOXaAhzH4nphAIFBcgFZ6Bb85_5NECSf6XaYsx6x0NyYuSCwXw',
        'https://lh3.googleusercontent.com/aida-public/AB6AXuA4G6yJKWXrsFcKnRVjY4iUeQqaDk4bnROUb1QZsoFAMBBxbVCMHmiGkwcXOhvfDMxeuAHEPpxaM-hZxHrTfmx3zka_ed-0v15OyyV0sSW4oWhC9VzT8M8cxOkv9BX9Hd-f9-Gi5XmB1SqNGEIhriYPqsbo_hEcLU8WZEo_fcNleWS1-uA6bKz7nLhIayTVKmcOwq6fJZn2kaA_GRkWOXz0dUrsNFQH3IO9lAE2TAC3he6E378VTZmQaA',
      ],
      category: 'Commercial Terry Towel',
      hsnCode: '6302.60',
      material: '100% Combed Ringspun Cotton',
      weaveType: '2/20s Ring',
      active: true,
    });

    const p1Sizes = await Size.insertMany([
      { product: p1._id, size: '25x50', price: 80, stock: 100, gsm: 500, weightKg: 0.063, active: true },
      { product: p1._id, size: '30x60', price: 120, stock: 250, gsm: 550, weightKg: 0.099, active: true },
      { product: p1._id, size: '40x80', price: 160, stock: 150, gsm: 600, weightKg: 0.192, active: true },
      { product: p1._id, size: '35x70', price: 140, stock: 80, gsm: 580, weightKg: 0.142, active: true },
      { product: p1._id, size: '70x140', price: 290, stock: 120, gsm: 650, weightKg: 0.637, active: true },
    ]);

    // Product 2: Pure White Salon & Spa Terry
    const p2 = await Product.create({
      name: 'Pure White Salon & Spa Terry',
      description: 'High absorbency • Bleach guard reactive white • Quick cycle dry for commercial salons & wellness clinics.',
      images: [
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCoDYdD9ozOqIkie8Ri4dtlGbS54d2Pyh1nFBU5yIIRZB5DJvm3ql4Y858m1_4WsL3K0A4cLOxTIG6fNWzBJZ_QI6WZkhnWDmTQsm1mY-TBGsDrhDUyssfPYFRf25byd1ojjtYFtp8i7AZ0cUCebRzVLdwV1XZ3T635MNtPTiHY_uu9TRt55-_B8qF--iLFVdULjBex9lnRvmRFiF5TZ6y3wUz8oWevpWo64cOO__kNWnCe5NrnuFBMrw',
      ],
      category: 'Salon & Spa Series',
      hsnCode: '6302.60',
      material: '100% Cotton Terry',
      weaveType: '2/20s Ring Spun',
      active: true,
    });

    const p2Sizes = await Size.insertMany([
      { product: p2._id, size: '25x50', price: 80, stock: 180, gsm: 450, weightKg: 0.056, active: true },
      { product: p2._id, size: '30x60', price: 110, stock: 140, gsm: 500, weightKg: 0.090, active: true },
    ]);

    // Product 3: Luxury Hotel Double-Loop Bath Towel
    const p3 = await Product.create({
      name: 'Luxury Hotel Double-Loop Bath Towel',
      description: 'Plush 600 GSM • Commercial laundry reinforced • Optic White with Double Dobby Satin Band.',
      images: [
        'https://lh3.googleusercontent.com/aida-public/AB6AXuA4G6yJKWXrsFcKnRVjY4iUeQqaDk4bnROUb1QZsoFAMBBxbVCMHmiGkwcXOhvfDMxeuAHEPpxaM-hZxHrTfmx3zka_ed-0v15OyyV0sSW4oWhC9VzT8M8cxOkv9BX9Hd-f9-Gi5XmB1SqNGEIhriYPqsbo_hEcLU8WZEo_fcNleWS1-uA6bKz7nLhIayTVKmcOwq6fJZn2kaA_GRkWOXz0dUrsNFQH3IO9lAE2TAC3he6E378VTZmQaA',
      ],
      category: 'Institutional Hospitality',
      hsnCode: '6302.60',
      material: '100% Combed Cotton',
      weaveType: 'Double Loop Terry',
      active: true,
    });

    const p3Sizes = await Size.insertMany([
      { product: p3._id, size: '40x80', price: 165, stock: 95, gsm: 600, weightKg: 0.192, active: true },
      { product: p3._id, size: '75x150', price: 320, stock: 70, gsm: 650, weightKg: 0.731, active: true },
    ]);

    console.log(`[Seed] Created 3 products with total ${p1Sizes.length + p2Sizes.length + p3Sizes.length} dynamic sizes.`);
    const whiteTowel = p1;
    const createdSizes = p1Sizes;

    // 5. Create Sample Order & OrderItems
    console.log('[Seed] Creating sample Order & OrderItems...');
    const sampleOrder = new Order({
      orderNumber: 'GT-9421',
      customer: customerUser._id,
      subtotal: 36000,
      deliveryCharge: 0,
      tax: 1800, // 5% GST
      totalAmount: 37800,
      paymentMethod: 'UPI',
      paymentStatus: 'PAID',
      orderStatus: 'CONFIRMED',
      shippingAddress: {
        name: customerUser.name,
        phone: customerUser.phone,
        address: customerUser.address,
        city: customerUser.city,
        state: customerUser.state,
        pincode: customerUser.pincode,
        gstin: customerUser.gstin,
      },
      notes: 'Please pack in compressed HDPE export woven bales.',
    });
    await sampleOrder.save();

    // Order items preserving purchase-time price and size string
    const item1 = await OrderItem.create({
      order: sampleOrder._id,
      customer: customerUser._id,
      customerName: customerUser.companyName || customerUser.name,
      product: whiteTowel._id,
      productName: whiteTowel.name,
      size: '30x60',
      sizeRef: createdSizes[1]._id,
      quantity: 200,
      price: 120, // Historical snapshot
      subtotal: 24000,
    });

    const item2 = await OrderItem.create({
      order: sampleOrder._id,
      customer: customerUser._id,
      customerName: customerUser.companyName || customerUser.name,
      product: whiteTowel._id,
      productName: whiteTowel.name,
      size: '25x50',
      sizeRef: createdSizes[0]._id,
      quantity: 150,
      price: 80, // Historical snapshot
      subtotal: 12000,
    });

    sampleOrder.items = [item1._id, item2._id];
    await sampleOrder.save();
    console.log(`[Seed] Created Order #${sampleOrder.orderNumber} with 2 OrderItems totaling ₹${sampleOrder.totalAmount}`);

    // 6. Create Sample Invoice
    console.log('[Seed] Creating sample Invoice...');
    const sampleInvoice = await Invoice.create({
      invoiceNumber: 'INV-2026-001',
      order: sampleOrder._id,
      customer: customerUser._id,
      invoiceDate: new Date(),
      subtotal: 36000,
      deliveryCharge: 0,
      tax: 1800,
      totalAmount: 37800,
      paymentMethod: 'UPI',
      paymentStatus: 'PAID',
      hsnCode: '6302.60',
      millGstin: '33AAACG0184M1Z8',
    });
    console.log(`[Seed] Created Invoice #${sampleInvoice.invoiceNumber} for Order #${sampleOrder.orderNumber}`);

    console.log('\n=============================================');
    console.log('✅ DATABASE SEED COMPLETED SUCCESSFULLY!');
    console.log('=============================================\n');

    return {
      users: 2,
      products: 1,
      sizes: 3,
      orders: 1,
      orderItems: 2,
      invoices: 1,
    };
  } catch (error) {
    console.error(`[Seed] Error during seeding: ${error.message}`);
    console.error(error.stack);
    throw error;
  } finally {
    await disconnectDB();
  }
};

// Auto-run if executed directly
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDatabase().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
