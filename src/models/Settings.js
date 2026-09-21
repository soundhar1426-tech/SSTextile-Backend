import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
  {
    // Mill & Company Identity
    name: {
      type: String,
      default: 'SSTextiles',
      trim: true,
    },
    tagline: {
      type: String,
      default: 'Whole Sale Hand Looms Cloth Manufacturer',
      trim: true,
    },
    subTagline: {
      type: String,
      default: 'Direct Mill White Towels',
      trim: true,
    },
    address: {
      type: String,
      default: '123, Weaver Street, Textile Nagar, Erode - 638 001, Tamil Nadu.',
      trim: true,
    },
    phone: {
      type: String,
      default: '98765 43210, 98765 43211',
      trim: true,
    },
    whatsapp: {
      type: String,
      default: '919876543210',
      trim: true,
    },
    email: {
      type: String,
      default: 'contact@sstextiles.com',
      trim: true,
    },
    gstin: {
      type: String,
      default: '33AAAAA0000A1Z5',
      trim: true,
      uppercase: true,
    },
    pan: {
      type: String,
      default: 'AAAAA0000A',
      trim: true,
      uppercase: true,
    },
    stateCode: {
      type: String,
      default: '33',
      trim: true,
    },
    placeOfSupply: {
      type: String,
      default: 'Tamil Nadu (33)',
      trim: true,
    },
    vehicleNo: {
      type: String,
      default: 'TN 33 AB 1234',
      trim: true,
    },
    signatoryTitle: {
      type: String,
      default: 'Proprietor',
      trim: true,
    },
    deityText: {
      type: String,
      default: 'SHIVAM',
      trim: true,
    },
    transportMode: {
      type: String,
      default: 'Road Cargo / VRL Logistics',
      trim: true,
    },
    hsnCode: {
      type: String,
      default: '6302.60',
      trim: true,
    },
    taxRatePercent: {
      type: Number,
      default: 5,
    },
    cgstPercent: {
      type: Number,
      default: 2.5,
    },
    sgstPercent: {
      type: Number,
      default: 2.5,
    },
    igstPercent: {
      type: Number,
      default: 5,
    },

    // Commercial Bank Details for Invoicing
    bankDetails: {
      bankName: {
        type: String,
        default: 'State Bank of India',
        trim: true,
      },
      branch: {
        type: String,
        default: 'Erode Main',
        trim: true,
      },
      accountName: {
        type: String,
        default: 'SSTextiles',
        trim: true,
      },
      accountNumber: {
        type: String,
        default: '000012345678901',
        trim: true,
      },
      ifsc: {
        type: String,
        default: 'SBIN0001234',
        trim: true,
        uppercase: true,
      },
      accountType: {
        type: String,
        default: 'Current Account',
        trim: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

export const Settings = mongoose.model('Settings', settingsSchema);
export default Settings;
