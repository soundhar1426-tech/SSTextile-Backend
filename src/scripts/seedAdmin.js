import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';

dotenv.config();

const seedAdmin = async () => {
  try {
    console.log('========================================================');
    console.log('  Gowtham Tex — First Admin Seed Script');
    console.log('========================================================');

    await connectDB();

    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@gowthamtex.com').toLowerCase().trim();
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const adminName = process.env.ADMIN_NAME || 'Gowtham Tex Admin';
    const adminPhone = process.env.ADMIN_PHONE || '+919842712345';

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      console.log(`[SeedAdmin] Admin account already exists: ${adminEmail} (Role: ${existingAdmin.role})`);
      if (existingAdmin.role !== 'admin') {
        existingAdmin.role = 'admin';
        await existingAdmin.save();
        console.log(`[SeedAdmin] Upgraded existing user to role: 'admin'`);
      }
    } else {
      const newAdmin = await User.create({
        name: adminName,
        email: adminEmail,
        phone: adminPhone,
        password: adminPassword, // Will be hashed by User pre-save hook
        role: 'admin',
        city: 'Erode',
        state: 'Tamil Nadu',
        pincode: '638001',
      });

      console.log(`[SeedAdmin] Created initial admin account successfully!`);
      console.log(`  Name:  ${newAdmin.name}`);
      console.log(`  Email: ${newAdmin.email}`);
      console.log(`  Role:  ${newAdmin.role}`);
      console.log(`  ID:    ${newAdmin._id}`);
    }

    console.log('========================================================');
    console.log('  Admin Seed Completed Successfully!');
    console.log('========================================================');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('[SeedAdmin] Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();
