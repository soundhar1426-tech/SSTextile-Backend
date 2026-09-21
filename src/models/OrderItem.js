import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order reference is required'],
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    customerName: {
      type: String,
      trim: true,
      default: '',
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: false,
    },
    productName: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    hsnCode: {
      type: String,
      trim: true,
      default: '6302.60',
    },
    size: {
      type: String,
      required: [true, 'Size string is required (e.g. "25x50")'],
      trim: true,
    },
    sizeRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Size',
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1 piece'],
    },
    price: {
      type: Number,
      required: [true, 'Unit price at the time of purchase is required'],
      min: [0, 'Price cannot be negative'],
    },
    subtotal: {
      type: Number,
      required: [true, 'Item subtotal is required'],
      min: [0, 'Subtotal cannot be negative'],
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save calculation hook: subtotal = price * quantity
orderItemSchema.pre('validate', function (next) {
  if (this.price !== undefined && this.quantity !== undefined) {
    this.subtotal = Number((this.price * this.quantity).toFixed(2));
  }
  next();
});

export const OrderItem = mongoose.model('OrderItem', orderItemSchema);
export default OrderItem;
