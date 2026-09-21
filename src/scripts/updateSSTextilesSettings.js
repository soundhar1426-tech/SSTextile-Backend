import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Settings from '../models/Settings.js';
import User from '../models/User.js';

async function updateToSSTextiles() {
  try {
    await connectDB();
    console.log('[Script] Connected to MongoDB database');

    const sstextilesData = {
      name: 'SSTextiles',
      tagline: 'Whole Sale Hand Looms Cloth Manufacturer',
      subTagline: 'Direct Mill White Towels',
      address: '123, Weaver Street, Textile Nagar, Erode - 638 001, Tamil Nadu.',
      phone: '98765 43210, 98765 43211',
      whatsapp: '919876543210',
      email: 'contact@sstextiles.com',
      gstin: '33AAAAA0000A1Z5',
      pan: 'AAAAA0000A',
      stateCode: '33',
      placeOfSupply: 'Tamil Nadu (33)',
      signatoryTitle: 'Proprietor',
      deityText: 'SHIVAM',
      transportMode: 'Road Cargo / VRL Logistics',
      hsnCode: '6302.60',
      taxRatePercent: 5,
      cgstPercent: 2.5,
      sgstPercent: 2.5,
      igstPercent: 5,
      bankDetails: {
        bankName: 'State Bank of India',
        branch: 'Erode Main',
        accountName: 'SSTextiles',
        accountNumber: '30001234567',
        ifsc: 'SBIN0001234',
        accountType: 'Current Account',
      },
    };

    // Update or create settings document
    const existing = await Settings.findOne();
    if (existing) {
      await Settings.findByIdAndUpdate(existing._id, { $set: sstextilesData });
      console.log('[Script] Updated existing settings document to SSTextiles');
    } else {
      await Settings.create(sstextilesData);
      console.log('[Script] Created new settings document with SSTextiles');
    }

    // Update admin user records
    const adminUpdate = await User.updateMany(
      { role: 'admin' },
      { $set: { businessName: 'SSTextiles', gstin: '33AAAAA0000A1Z5', phone: '9876543210', email: 'admin@sstextiles.com' } }
    );
    console.log('[Script] Admin users updated:', adminUpdate);

    const updatedDoc = await Settings.findOne();
    console.log('[Script] Verified settings in MongoDB:', updatedDoc?.name, updatedDoc?.gstin, updatedDoc?.phone);

    await mongoose.disconnect();
    console.log('[Script] Done.');
    process.exit(0);
  } catch (err) {
    console.error('[Script] Error updating to SSTextiles:', err);
    process.exit(1);
  }
}

updateToSSTextiles();
