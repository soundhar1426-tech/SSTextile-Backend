import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: [true, 'Order number is required'],
      unique: true,
      trim: true,
      uppercase: true,
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
    deliveryDetails: {
      addressLine1: { type: String, trim: true },
      addressLine2: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      stateCode: { type: String, trim: true },
      pincode: { type: String, trim: true },
      contactPhone: { type: String, trim: true },
      transporter: { type: String, trim: true, default: 'VRL Logistics Cargo' },
    },
    shippingAddress: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      address: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      stateCode: { type: String, trim: true },
      pincode: { type: String, trim: true },
      gstin: { type: String, trim: true, uppercase: true },
    },
    buyerStateCode: {
      type: String,
      trim: true,
      default: '33',
    },
    items: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OrderItem',
      },
    ],
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
      min: [0, 'Tax cannot be negative'],
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
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
      enum: {
        values: ['pending', 'paid', 'failed', 'refunded', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'],
        message: '{VALUE} is not a valid payment status',
      },
      default: 'pending',
    },
    orderStatus: {
      type: String,
      enum: {
        values: [
          'new',
          'confirmed',
          'processing',
          'ready_for_dispatch',
          'dispatched',
          'delivered',
          'cancelled',
          'NEW',
          'CONFIRMED',
          'PROCESSING',
          'SHIPPED',
          'DELIVERED',
          'CANCELLED',
          'PENDING',
          'Ready for Lorry Loading',
          'Payment Verified (NEFT)',
          'Dispatched / In Transit',
        ],
        message: '{VALUE} is not a valid order status',
      },
      default: 'new',
    },
    invoiceStatus: {
      type: String,
      enum: ['not_generated', 'generated', 'NOT_GENERATED', 'GENERATED'],
      default: 'not_generated',
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
    },
    invoiceNumber: {
      type: String,
      trim: true,
      default: null,
    },
    paymentDetails: {
      confirmedAt: { type: Date },
      confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      paymentMethod: { type: String },
      paymentReference: { type: String, trim: true },
      amountConfirmed: { type: Number },
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook: ensure total mirrors totalAmount if not set
orderSchema.pre('validate', function (next) {
  if (this.totalAmount !== undefined && this.total === undefined) {
    this.total = this.totalAmount;
  }
  if (this.total !== undefined && this.totalAmount === undefined) {
    this.totalAmount = this.total;
  }
  next();
});

// Indexes for order status and creation date queries
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });

export const Order = mongoose.model('Order', orderSchema);
export default Order;
