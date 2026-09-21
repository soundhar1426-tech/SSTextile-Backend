import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { Size } from '../models/Size.js';

/**
 * Format a dynamic size for customer display
 */
const formatCustomerSize = (size) => {
  // Parse dimensions from size string like "25x50"
  let width = 30;
  let length = 60;
  if (size.size && size.size.includes('x')) {
    const parts = size.size.split('x');
    width = Number(parts[0]) || 30;
    length = Number(parts[1]) || 60;
  }

  const inchesStr = `${Math.round(width / 2.54)}×${Math.round(length / 2.54)} in`;

  let status = 'In Stock';
  if (size.stock === 0) {
    status = 'Out of Stock';
  } else if (size.stock <= 10) {
    status = 'Low Stock';
  } else if (size.stock >= 200) {
    status = 'Optimal Stock';
  }

  const grams = size.grams || (size.weightKg ? Math.round(size.weightKg * 1000) : Math.round((width * length * (size.gsm || 500)) / 10000));
  const weightKg = size.weightKg || Number((grams / 1000).toFixed(3));

  return {
    id: size._id,
    _id: size._id,
    size: size.size,
    dimension: `${size.size} cm`,
    inches: inchesStr,
    widthCm: width,
    lengthCm: length,
    price: size.price,
    stock: size.stock,
    gsm: size.gsm || 500,
    grams: grams,
    weightKg: weightKg,
    moq: 40,
    isPopular: size.price >= 120,
    status,
    active: size.active,
  };
};

/**
 * Format a product with its active dynamic sizes for customer browsing
 */
const formatCustomerProduct = (product, sizes = []) => {
  const activeSizes = sizes.filter((s) => s.active !== false).map(formatCustomerSize);
  const totalStock = activeSizes.reduce((sum, s) => sum + s.stock, 0);
  const minPrice = activeSizes.length > 0 ? Math.min(...activeSizes.map((s) => s.price)) : 0;
  const maxPrice = activeSizes.length > 0 ? Math.max(...activeSizes.map((s) => s.price)) : 0;

  const defaultImage =
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCCdKqsvfuy2yau3AySGBI8zrrt1U9ghlW3X5wsoSzGBmztb7AyEZEhYV6EL6hsHNIBYMWtdL482GVLBRWvqbV0yTmpIlrmoJph838qaVWq9l1eDuxkE1I__-yKdS3oaLCCRrHpvWejMDeHWnT87rkOyHa0EKZu56Gbw6hoaMcb3hM9wIo5pCxDGGx6g7JtSEJY9wy9ZOXaAhzH4nphAIFBcgFZ6Bb85_5NECSf6XaYsx6x0NyYuSCwXw';

  const image =
    product.images && product.images.length > 0 && product.images[0]
      ? product.images[0]
      : defaultImage;

  return {
    id: product._id,
    _id: product._id,
    name: product.name,
    title: product.name, // alias for UI compatibility
    description: product.description || '',
    subtitle: product.description || 'Institutional grade white terry towel for commercial hospitality',
    images: product.images && product.images.length > 0 ? product.images : [defaultImage],
    image,
    category: product.category || 'White Towels',
    hsnCode: product.hsnCode || '6302.60',
    material: product.material || '100% Combed Ringspun Cotton',
    weaveType: product.weaveType || '2/20s Ring Spun',
    gsmRange: product.gsmRange || '500 - 650 GSM',
    fastness: 'Grade 4+ Cl',
    status: totalStock > 0 ? 'Ready to Dispatch' : 'Out of Stock',
    active: product.active,
    minPrice,
    maxPrice,
    totalStock,
    sizes: activeSizes,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
};

/**
 * @desc    Get all active products for customer catalog (Public)
 * @route   GET /api/products
 * @access  Public
 */
export const getPublicProducts = async (req, res) => {
  try {
    // Only return active products
    const products = await Product.find({ active: true }).sort({ createdAt: -1 });

    const productIds = products.map((p) => p._id);

    // Only return active dynamic sizes
    const allSizes = await Size.find({
      product: { $in: productIds },
      active: true,
    }).sort({ price: 1 });

    // Group active sizes by product ID
    const sizeMap = {};
    allSizes.forEach((size) => {
      const pId = size.product.toString();
      if (!sizeMap[pId]) sizeMap[pId] = [];
      sizeMap[pId].push(size);
    });

    const formattedProducts = products.map((product) =>
      formatCustomerProduct(product, sizeMap[product._id.toString()] || [])
    );

    return res.status(200).json({
      success: true,
      count: formattedProducts.length,
      products: formattedProducts,
    });
  } catch (error) {
    console.error('[CustomerProductController] Error fetching public products:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving product catalog',
    });
  }
};

/**
 * @desc    Get single product details with active dynamic sizes (Public)
 * @route   GET /api/products/:id
 * @access  Public
 */
export const getPublicProductById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Only fetch if product is active
    const product = await Product.findOne({ _id: id, active: true });
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Only fetch active sizes for this product
    const activeSizes = await Size.find({
      product: product._id,
      active: true,
    }).sort({ price: 1 });

    return res.status(200).json({
      success: true,
      product: formatCustomerProduct(product, activeSizes),
    });
  } catch (error) {
    console.error('[CustomerProductController] Error fetching product details:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving product details',
    });
  }
};
