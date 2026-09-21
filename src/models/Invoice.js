import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: [true, 'Invoice number is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order reference is required'],
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer reference is required'],
      index: true,
    },
    customerDetails: {
      name: { type: String, trim: true },
      businessName: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true },
      gstin: { type: String, trim: true, uppercase: true },
      state: { type: String, trim: true },
      stateCode: { type: String, trim: true },
    },
    deliveryAddress: {
      addressLine1: { type: String, trim: true },
      addressLine2: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      stateCode: { type: String, trim: true },
      pincode: { type: String, trim: true },
      contactPhone: { type: String, trim: true },
      transporter: { type: String, trim: true },
    },
    buyerState: {
      type: String,
      trim: true,
    },
    buyerStateCode: {
      type: String,
      trim: true,
      default: '33',
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
        },
        productName: { type: String, trim: true },
        hsnCode: { type: String, trim: true, default: '6302.60' },
        size: { type: String, trim: true },
        sizeRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Size' },
        quantity: { type: Number },
        price: { type: Number },
        subtotal: { type: Number },
      },
    ],
    invoiceDate: {
      type: Date,
      default: Date.now,
    },
    totalPieces: {
      type: Number,
      default: 0,
      min: [0, 'Total pieces cannot be negative'],
    },
    subtotal: {
      type: Number,
      required: [true, 'Subtotal is required'],
      min: [0, 'Subtotal cannot be negative'],
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative'],
    },
    deliveryCharge: {
      type: Number,
      default: 0,
      min: [0, 'Delivery charge cannot be negative'],
    },
    tax: {
      type: Number,
      default: 0,
      min: [0, 'Tax amount cannot be negative'],
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total invoice amount is required'],
      min: [0, 'Total amount cannot be negative'],
    },
    total: {
      type: Number,
      min: [0, 'Total cannot be negative'],
    },
    paymentMethod: {
      type: String,
      default: 'UPI',
    },
    paymentStatus: {
      type: String,
      default: 'paid',
    },
    paymentReference: {
      type: String,
      default: '',
      trim: true,
    },
    paymentConfirmedAt: {
      type: Date,
      default: Date.now,
    },
    ewbNo: {
      type: String,
      trim: true,
      default: '',
    },
    placeOfSupply: {
      type: String,
      trim: true,
      default: 'Tamil Nadu (33)',
    },
    vehicleNo: {
      type: String,
      trim: true,
      default: 'TN 33 AB 1234',
    },
    transportMode: {
      type: String,
      trim: true,
      default: 'Road Cargo / VRL Logistics',
    },
    signatoryTitle: {
      type: String,
      trim: true,
      default: 'Proprietor',
    },
    isCustomized: {
      type: Boolean,
      default: false,
    },
    hsnCode: {
      type: String,
      trim: true,
      default: '6302.60',
    },
    millGstin: {
      type: String,
      trim: true,
      default: '33AAAAA0000A1Z5',
    },
    millDetails: {
      name: { type: String, default: 'SSTextiles' },
      tagline: { type: String, default: 'Whole Sale Hand Looms Cloth Manufacturer' },
      deityText: { type: String, default: 'SHIVAM' },
      address: { type: String, default: '123, Weaver Street, Textile Nagar, Erode - 638 001, Tamil Nadu.' },
      gstin: { type: String, default: '33AAAAA0000A1Z5' },
      stateCode: { type: String, default: '33' },
      phone: { type: String, default: '98765 43210, 98765 43211' },
      email: { type: String, default: 'contact@sstextiles.com' },
      signatoryTitle: { type: String, default: 'Proprietor' },
      bankDetails: {
        accountName: { type: String, default: 'SSTextiles' },
        bankName: { type: String, default: 'State Bank of India' },
        accountNumber: { type: String, default: '000012345678901' },
        ifsc: { type: String, default: 'SBIN0001234' },
        branch: { type: String, default: 'Erode Main' },
      },
    },
  },
  {
    timestamps: true,
  }
);

invoiceSchema.pre('validate', function (next) {
  if (this.totalAmount !== undefined && this.total === undefined) {
    this.total = this.totalAmount;
  }
  if (this.total !== undefined && this.totalAmount === undefined) {
    this.totalAmount = this.total;
  }
  next();
});

// Index for date-based invoice filtering
invoiceSchema.index({ invoiceDate: -1 });

export const Invoice = mongoose.model('Invoice', invoiceSchema);
export default Invoice;
