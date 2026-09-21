import mongoose from 'mongoose';

const sizeSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required for a size'],
      index: true,
    },
    size: {
      type: String,
      required: [true, 'Size specification is required (e.g. "25x50", "30x60")'],
      trim: true,
      validate: {
        validator: function (v) {
          // Ensure admin enters clean format like "25x50" without "inch" or "cm" suffix in the raw dimension key
          return !v.toLowerCase().includes('inch');
        },
        message: 'Size string should not include "inch". Use format such as "25x50".',
      },
    },
    price: {
      type: Number,
      required: [true, 'Price is required for this size'],
      min: [0, 'Price cannot be negative'],
    },
    stock: {
      type: Number,
      required: [true, 'Stock count is required'],
      min: [0, 'Stock cannot be negative'],
      default: 0,
    },
    gsm: {
      type: Number,
      min: [0, 'GSM density cannot be negative'],
      default: 500,
    },
    grams: {
      type: Number,
      min: [0, 'Weight in grams cannot be negative'],
      default: 0,
    },
    weightKg: {
      type: Number,
      min: [0, 'Weight cannot be negative'],
      default: 0.1,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: Prevent duplicate size entries for the same product
sizeSchema.index({ product: 1, size: 1 }, { unique: true });

export const Size = mongoose.model('Size', sizeSchema);
export default Size;
