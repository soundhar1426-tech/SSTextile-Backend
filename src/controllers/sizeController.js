import mongoose from 'mongoose';
import { Size } from '../models/Size.js';
import { Product } from '../models/Product.js';

/**
 * Normalize size string to a clean canonical format, e.g. "25x50"
 */
export const normalizeSizeKey = (val) => {
  if (!val) return '';
  return String(val)
    .toLowerCase()
    .replace(/cm|inch|in/gi, '')
    .replace(/[×*X]/g, 'x')
    .replace(/\s+/g, '')
    .trim();
};

/**
 * Format a single size document
 */
const formatSizeResponse = (size) => {
  const grams = size.grams || (size.weightKg ? Math.round(size.weightKg * 1000) : 100);
  const weightKg = size.weightKg || Number((grams / 1000).toFixed(3));

  return {
    id: size._id,
    _id: size._id,
    productId: size.product,
    size: size.size,
    dimension: `${size.size} cm`,
    price: size.price,
    stock: size.stock,
    gsm: size.gsm || 500,
    grams: grams,
    weightKg: weightKg,
    category: `${size.size} Towel Spec`,
    isPopular: size.price >= 120,
    active: size.active,
    status: size.stock > 0 ? (size.stock >= 200 ? 'Optimal Stock' : 'In Stock') : 'Out of Stock',
    createdAt: size.createdAt,
    updatedAt: size.updatedAt,
  };
};

/**
 * @desc    Get all sizes for a given product
 * @route   GET /api/admin/products/:productId/sizes
 * @access  Private/Admin
 */
export const getProductSizes = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format',
      });
    }

    const sizes = await Size.find({ product: productId, active: true }).sort({ price: 1 });

    return res.status(200).json({
      success: true,
      count: sizes.length,
      sizes: sizes.map(formatSizeResponse),
    });
  } catch (error) {
    console.error('[SizeController] Error fetching product sizes:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving product sizes',
    });
  }
};

/**
 * @desc    Add a new dynamic size to a product
 * @route   POST /api/admin/products/:productId/sizes
 * @access  Private/Admin
 */
export const createProductSize = async (req, res) => {
  try {
    const { productId } = req.params;
    const { size, dimension, widthCm, lengthCm, price, stock, gsm, grams, weightGrams, grms, weightKg } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format',
      });
    }

    // Verify parent product exists and is active
    const product = await Product.findById(productId);
    if (!product || !product.active) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or is inactive.',
      });
    }

    // Extract & normalize dimension string (e.g. "25x50")
    let rawInput = size || dimension || (widthCm && lengthCm ? `${widthCm}x${lengthCm}` : '');
    const rawSize = normalizeSizeKey(rawInput);

    // Validation 1: Size is required and non-empty string
    if (!rawSize) {
      return res.status(400).json({
        success: false,
        message: 'Size specification is required (e.g. "25x50").',
      });
    }

    // Validation 2: Price must be >= 0
    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Price must be 0 or greater.',
      });
    }

    // Validation 3: Stock must be >= 0
    const numStock = Number(stock !== undefined ? stock : 0);
    if (isNaN(numStock) || numStock < 0) {
      return res.status(400).json({
        success: false,
        message: 'Stock must be 0 or greater.',
      });
    }

    // Validation 4: Calculate or extract grams and weightKg
    const numGsm = Number(gsm) || 500;
    let numGrams = 0;
    let numWeightKg = 0;

    const providedGrams = grams !== undefined ? grams : (weightGrams !== undefined ? weightGrams : grms);

    if (providedGrams !== undefined && providedGrams !== null && providedGrams !== '') {
      numGrams = Math.max(0, Number(providedGrams));
      numWeightKg = Number((numGrams / 1000).toFixed(3));
    } else if (weightKg !== undefined && weightKg !== null && weightKg !== '') {
      numWeightKg = Math.max(0, Number(weightKg));
      numGrams = Math.round(numWeightKg * 1000);
    } else {
      // Auto-calculate from dimensions and GSM (cm * cm * gsm / 10000)
      let w = 30;
      let l = 60;
      if (rawSize.includes('x')) {
        const parts = rawSize.split('x');
        w = Number(parts[0]) || 30;
        l = Number(parts[1]) || 60;
      }
      numGrams = Math.max(10, Math.round((w * l * numGsm) / 10000));
      numWeightKg = Number((numGrams / 1000).toFixed(3));
    }

    // Validation 5: Prevent duplicate active sizes for this product
    const existingSize = await Size.findOne({
      product: productId,
      size: rawSize,
      active: true,
    });

    if (existingSize) {
      return res.status(400).json({
        success: false,
        message: `Size "${rawSize}" already exists for this product. Duplicate sizes are not allowed.`,
      });
    }

    const newSize = await Size.create({
      product: productId,
      size: rawSize,
      price: numPrice,
      stock: numStock,
      gsm: numGsm,
      grams: numGrams,
      weightKg: numWeightKg,
      active: true,
    });

    return res.status(201).json({
      success: true,
      message: `Size "${rawSize}" (${numGrams}g) added successfully`,
      size: formatSizeResponse(newSize),
    });
  } catch (error) {
    console.error('[SizeController] Error creating size:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error creating size',
    });
  }
};

/**
 * @desc    Update an existing dynamic size (Price, Stock, Grams, Dimension)
 * @route   PUT /api/admin/sizes/:id
 * @access  Private/Admin
 */
export const updateSize = async (req, res) => {
  try {
    const { id } = req.params;
    const { size, dimension, price, stock, delta, gsm, grams, weightGrams, grms, weightKg, active } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid size ID format',
      });
    }

    const sizeDoc = await Size.findById(id);
    if (!sizeDoc) {
      return res.status(404).json({
        success: false,
        message: 'Size not found.',
      });
    }

    // If size dimension is being updated
    if (size !== undefined || dimension !== undefined) {
      const rawInput = size || dimension || '';
      const rawSize = normalizeSizeKey(rawInput);
      if (!rawSize) {
        return res.status(400).json({
          success: false,
          message: 'Size specification cannot be empty.',
        });
      }

      // Check duplicate on same product
      const duplicate = await Size.findOne({
        product: sizeDoc.product,
        size: rawSize,
        active: true,
        _id: { $ne: sizeDoc._id },
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `Size "${rawSize}" already exists for this product. Duplicate sizes are not allowed.`,
        });
      }
      sizeDoc.size = rawSize;
    }

    // Price update
    if (price !== undefined) {
      const numPrice = Number(price);
      if (isNaN(numPrice) || numPrice < 0) {
        return res.status(400).json({
          success: false,
          message: 'Price must be 0 or greater.',
        });
      }
      sizeDoc.price = numPrice;
    }

    // Direct Stock update or Delta adjustment
    if (stock !== undefined) {
      const numStock = Number(stock);
      if (isNaN(numStock) || numStock < 0) {
        return res.status(400).json({
          success: false,
          message: 'Stock must be 0 or greater.',
        });
      }
      sizeDoc.stock = numStock;
    } else if (delta !== undefined) {
      const numDelta = Number(delta);
      if (isNaN(numDelta)) {
        return res.status(400).json({
          success: false,
          message: 'Stock adjustment delta must be a valid number.',
        });
      }
      sizeDoc.stock = Math.max(0, sizeDoc.stock + numDelta);
    }

    if (gsm !== undefined) sizeDoc.gsm = Number(gsm) || 500;

    // Grams / weight update
    const providedGrams = grams !== undefined ? grams : (weightGrams !== undefined ? weightGrams : grms);
    if (providedGrams !== undefined && providedGrams !== null && providedGrams !== '') {
      const numG = Math.max(0, Number(providedGrams));
      sizeDoc.grams = numG;
      sizeDoc.weightKg = Number((numG / 1000).toFixed(3));
    } else if (weightKg !== undefined && weightKg !== null && weightKg !== '') {
      const numW = Math.max(0, Number(weightKg));
      sizeDoc.weightKg = numW;
      sizeDoc.grams = Math.round(numW * 1000);
    }

    if (active !== undefined) sizeDoc.active = Boolean(active);

    await sizeDoc.save();

    return res.status(200).json({
      success: true,
      message: 'Size updated successfully',
      size: formatSizeResponse(sizeDoc),
    });
  } catch (error) {
    console.error('[SizeController] Error updating size:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error updating size',
    });
  }
};

/**
 * @desc    Deactivate a size (Soft delete)
 * @route   DELETE /api/admin/sizes/:id
 * @access  Private/Admin
 */
export const deleteSize = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid size ID format',
      });
    }

    const sizeDoc = await Size.findById(id);
    if (!sizeDoc) {
      return res.status(404).json({
        success: false,
        message: 'Size not found.',
      });
    }

    sizeDoc.active = false;
    await sizeDoc.save();

    return res.status(200).json({
      success: true,
      message: `Size "${sizeDoc.size}" has been deactivated successfully.`,
    });
  } catch (error) {
    console.error('[SizeController] Error deleting size:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error deleting size',
    });
  }
};
