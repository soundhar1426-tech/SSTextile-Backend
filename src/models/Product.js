import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    images: {
      type: [String],
      default: [],
    },
    category: {
      type: String,
      trim: true,
      default: 'Commercial Terry Towel',
    },
    hsnCode: {
      type: String,
      trim: true,
      default: '6302.60',
    },
    material: {
      type: String,
      trim: true,
      default: 'Cotton',
    },
    weaveType: {
      type: String,
      trim: true,
      default: '2/20s Ring',
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual relationship to Size documents
productSchema.virtual('sizes', {
  ref: 'Size',
  localField: '_id',
  foreignField: 'product',
});

// Index on product name and active status
productSchema.index({ name: 1 });
productSchema.index({ active: 1 });

export const Product = mongoose.model('Product', productSchema);
export default Product;
