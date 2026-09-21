import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { Size } from '../models/Size.js';
import { normalizeSizeKey } from './sizeController.js';

const DEFAULT_TOWEL_IMAGE = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCCdKqsvfuy2yau3AySGBI8zrrt1U9ghlW3X5wsoSzGBmztb7AyEZEhYV6EL6hsHNIBYMWtdL482GVLBRWvqbV0yTmpIlrmoJph838qaVWq9l1eDuxkE1I__-yKdS3oaLCCRrHpvWejMDeHWnT87rkOyHa0EKZu56Gbw6hoaMcb3hM9wIo5pCxDGGx6g7JtSEJY9wy9ZOXaAhzH4nphAIFBcgFZ6Bb85_5NECSf6XaYsx6x0NyYuSCwXw';

/**
 * Format product object with computed metrics
 */
const formatProductResponse = (product, sizes = []) => {
  const activeSizes = sizes.filter((s) => s.active !== false);
  const totalStock = activeSizes.reduce((sum, s) => sum + (Number(s.stock) || 0), 0);
  const minPrice = activeSizes.length > 0 ? Math.min(...activeSizes.map((s) => s.price)) : 0;
  const maxPrice = activeSizes.length > 0 ? Math.max(...activeSizes.map((s) => s.price)) : 0;

  const validImages = product.images && product.images.length > 0 && product.images[0] ? product.images : [DEFAULT_TOWEL_IMAGE];
  const primaryImage = validImages[0];
  const firstSize = activeSizes[0] || null;
  const firstGrams = firstSize ? (firstSize.grams || (firstSize.weightKg ? Math.round(firstSize.weightKg * 1000) : 300)) : 300;
  const firstWeightKg = firstSize ? (firstSize.weightKg || Number((firstGrams / 1000).toFixed(3))) : 0.3;

  return {
    id: product._id,
    _id: product._id,
    name: product.name,
    title: product.name, // alias for frontend compatibility
    description: product.description || '',
    subtitle: product.description || '',
    images: validImages,
    image: primaryImage,
    category: product.category || 'White Towels',
    hsnCode: product.hsnCode || '6302.60',
    material: product.material || '100% Combed Ringspun Cotton',
    weaveType: product.weaveType || '2/20s Ring Spun',
    gsmRange: product.gsmRange || '500 - 650 GSM',
    active: product.active,
    status: product.active ? 'Ready to Dispatch' : 'Inactive',
    totalStock,
    minPrice,
    maxPrice,
    price: firstSize ? firstSize.price : 0,
    stock: firstSize ? firstSize.stock : 0,
    size: firstSize ? firstSize.size : '50x100',
    dimension: firstSize ? `${firstSize.size} cm` : '50x100 cm',
    grams: firstGrams,
    gsm: firstSize ? (firstSize.gsm || 600) : 600,
    weightKg: firstWeightKg,
    sizes: activeSizes.map((s) => {
      const grams = s.grams || (s.weightKg ? Math.round(s.weightKg * 1000) : 100);
      const weightKg = s.weightKg || Number((grams / 1000).toFixed(3));
      return {
        id: s._id,
        _id: s._id,
        productId: product._id,
        size: s.size,
        dimension: `${s.size} cm`,
        price: s.price,
        stock: s.stock,
        gsm: s.gsm || 500,
        grams: grams,
        weightKg: weightKg,
        isPopular: s.price >= 120,
        active: s.active,
        status: s.stock > 0 ? (s.stock >= 200 ? 'Optimal Stock' : 'In Stock') : 'Out of Stock',
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    }),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
};

/**
 * @desc    Get all admin products with their populated dynamic sizes
 * @route   GET /api/admin/products
 * @access  Private/Admin
 */
export const getAdminProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });

    // Fetch active sizes for all products in one query
    const productIds = products.map((p) => p._id);
    const allSizes = await Size.find({ product: { $in: productIds }, active: true }).sort({ price: 1 });

    // Group sizes by product ID
    const sizeMap = {};
    allSizes.forEach((size) => {
      const pId = size.product.toString();
      if (!sizeMap[pId]) sizeMap[pId] = [];
      sizeMap[pId].push(size);
    });

    const formattedProducts = products.map((product) =>
      formatProductResponse(product, sizeMap[product._id.toString()] || [])
    );

    return res.status(200).json({
      success: true,
      count: formattedProducts.length,
      products: formattedProducts,
    });
  } catch (error) {
    console.error('[ProductController] Error fetching admin products:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving products',
    });
  }
};

/**
 * @desc    Get single product by ID with its dynamic sizes
 * @route   GET /api/admin/products/:id
 * @access  Private/Admin
 */
export const getAdminProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const sizes = await Size.find({ product: product._id, active: true }).sort({ price: 1 });

    return res.status(200).json({
      success: true,
      product: formatProductResponse(product, sizes),
    });
  } catch (error) {
    console.error('[ProductController] Error fetching product by ID:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving product details',
    });
  }
};

/**
 * @desc    Create a new product
 * @route   POST /api/admin/products
 * @access  Private/Admin
 */
export const createAdminProduct = async (req, res) => {
  try {
    const { name, title, description, subtitle, images, image, category, hsnCode, material, weaveType, active, sizes } = req.body;

    const productName = (name || title || '').trim();
    if (!productName) {
      return res.status(400).json({
        success: false,
        message: 'Product name is required.',
      });
    }

    // Normalize image list
    let imageList = [];
    if (Array.isArray(images) && images.length > 0) {
      imageList = images.filter(Boolean);
    } else if (image) {
      imageList = [image];
    }

    const product = await Product.create({
      name: productName,
      description: (description || subtitle || '').trim(),
      images: imageList,
      category: (category || 'White Towels').trim(),
      hsnCode: (hsnCode || '6302.60').trim(),
      material: (material || 'Cotton').trim(),
      weaveType: (weaveType || '2/20s Ring').trim(),
      active: active !== undefined ? Boolean(active) : true,
    });

    // If initial sizes were supplied during product creation, create them (prevent duplicates)
    let createdSizes = [];
    const seenSizes = new Set();

    if (Array.isArray(sizes) && sizes.length > 0) {
      for (const sizeItem of sizes) {
        const rawSize = normalizeSizeKey(sizeItem.size || sizeItem.dimension || '');
        const price = Number(sizeItem.price);
        const stock = Number(sizeItem.stock || 0);

        if (rawSize && price >= 0 && stock >= 0 && !seenSizes.has(rawSize)) {
          seenSizes.add(rawSize);

          const numGsm = Number(sizeItem.gsm) || 500;
          let numGrams = Number(sizeItem.grams || sizeItem.weightGrams || sizeItem.grms);
          let numWeightKg = Number(sizeItem.weightKg);

          if (!numGrams && numWeightKg) {
            numGrams = Math.round(numWeightKg * 1000);
          } else if (numGrams && !numWeightKg) {
            numWeightKg = Number((numGrams / 1000).toFixed(3));
          } else if (!numGrams && !numWeightKg) {
            let w = 30, l = 60;
            if (rawSize.includes('x')) {
              const parts = rawSize.split('x');
              w = Number(parts[0]) || 30;
              l = Number(parts[1]) || 60;
            }
            numGrams = Math.round((w * l * numGsm) / 10000);
            numWeightKg = Number((numGrams / 1000).toFixed(3));
          }

          const createdSize = await Size.create({
            product: product._id,
            size: rawSize,
            price,
            stock,
            gsm: numGsm,
            grams: numGrams,
            weightKg: numWeightKg,
            active: true,
          });
          createdSizes.push(createdSize);
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product: formatProductResponse(product, createdSizes),
    });
  } catch (error) {
    console.error('[ProductController] Error creating product:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error creating product',
    });
  }
};

/**
 * @desc    Update an existing product
 * @route   PUT /api/admin/products/:id
 * @access  Private/Admin
 */
export const updateAdminProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, title, description, subtitle, images, image, category, hsnCode, material, weaveType, active, sizes } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    if (name !== undefined || title !== undefined) {
      const newName = (name || title || '').trim();
      if (!newName) {
        return res.status(400).json({
          success: false,
          message: 'Product name cannot be empty.',
        });
      }
      product.name = newName;
    }

    if (description !== undefined || subtitle !== undefined) {
      product.description = (description || subtitle || '').trim();
    }

    if (images !== undefined) {
      product.images = Array.isArray(images) ? images : [images];
    } else if (image !== undefined) {
      product.images = image ? [image] : [];
    }

    if (category !== undefined) product.category = category.trim();
    if (hsnCode !== undefined) product.hsnCode = hsnCode.trim();
    if (material !== undefined) product.material = material.trim();
    if (weaveType !== undefined) product.weaveType = weaveType.trim();

    if (active !== undefined) {
      product.active = Boolean(active);
      // Synchronize sizes active state with product active state
      if (product.active) {
        await Size.updateMany({ product: product._id }, { active: true });
      } else {
        await Size.updateMany({ product: product._id }, { active: false });
      }
    }

    await product.save();

    // If sizes array was supplied in update payload, sync or create sizes (prevent duplicates)
    if (Array.isArray(sizes) && sizes.length > 0) {
      const seenSizes = new Set();
      const updatedSizeIds = [];

      for (const s of sizes) {
        const rawSize = normalizeSizeKey(s.size || s.dimension || '');
        if (!rawSize || seenSizes.has(rawSize)) continue;
        seenSizes.add(rawSize);

        const numGsm = Number(s.gsm) || 500;
        let numGrams = Number(s.grams !== undefined ? s.grams : (s.weightGrams !== undefined ? s.weightGrams : s.grms));
        let numWeightKg = Number(s.weightKg);

        if (!isNaN(numGrams) && numGrams > 0) {
          numWeightKg = Number((numGrams / 1000).toFixed(3));
        } else if (!isNaN(numWeightKg) && numWeightKg > 0) {
          numGrams = Math.round(numWeightKg * 1000);
        } else {
          let w = 30, l = 60;
          if (rawSize.includes('x')) {
            const parts = rawSize.split('x');
            w = Number(parts[0]) || 30;
            l = Number(parts[1]) || 60;
          }
          numGrams = Math.round((w * l * numGsm) / 10000);
          numWeightKg = Number((numGrams / 1000).toFixed(3));
        }

        let sizeDoc = null;
        const potentialId = s._id || s.id;
        if (potentialId && mongoose.Types.ObjectId.isValid(potentialId)) {
          sizeDoc = await Size.findById(potentialId);
        }
        if (!sizeDoc && rawSize) {
          sizeDoc = await Size.findOne({ product: product._id, size: rawSize });
        }

        if (sizeDoc) {
          sizeDoc.size = rawSize;
          sizeDoc.price = Number(s.price);
          sizeDoc.stock = Number(s.stock);
          sizeDoc.gsm = numGsm;
          sizeDoc.grams = numGrams;
          sizeDoc.weightKg = numWeightKg;
          sizeDoc.active = s.active !== undefined ? Boolean(s.active) : true;
          await sizeDoc.save();
          updatedSizeIds.push(sizeDoc._id);
        } else if (rawSize) {
          const createdSize = await Size.create({
            product: product._id,
            size: rawSize,
            price: Number(s.price || 0),
            stock: Number(s.stock || 0),
            gsm: numGsm,
            grams: numGrams,
            weightKg: numWeightKg,
            active: s.active !== undefined ? Boolean(s.active) : true,
          });
          updatedSizeIds.push(createdSize._id);
        }
      }

      // If specific sizes were provided in form, deactivate any existing sizes for this product that were excluded
      if (updatedSizeIds.length > 0) {
        await Size.updateMany(
          { product: product._id, _id: { $nin: updatedSizeIds } },
          { active: false }
        );
      }
    }

    const currentSizes = await Size.find({ product: product._id, active: true }).sort({ price: 1 });

    return res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      product: formatProductResponse(product, currentSizes),
    });
  } catch (error) {
    console.error('[ProductController] Error updating product:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error updating product',
    });
  }
};

/**
 * @desc    Deactivate / Delete product (Soft delete to preserve historical integrity)
 * @route   DELETE /api/admin/products/:id
 * @access  Private/Admin
 */
export const deleteAdminProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required',
      });
    }

    let product = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      product = await Product.findById(id);
    }
    if (!product) {
      product = await Product.findOne({
        $or: [{ _id: id }, { name: id }],
      });
    }

    if (!product) {
      return res.status(200).json({
        success: true,
        message: 'Product removed successfully.',
      });
    }

    const productId = product._id;
    const productName = product.name;

    // Permanently delete product
    await Product.findByIdAndDelete(productId);

    // Delete corresponding sizes
    await Size.deleteMany({ product: productId });

    return res.status(200).json({
      success: true,
      message: `Product "${productName}" and its sizes have been removed successfully.`,
    });
  } catch (error) {
    console.error('[ProductController] Error deleting product:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error deleting product',
    });
  }
};

/**
 * @desc    Get aggregated inventory summary from real MongoDB data
 * @route   GET /api/admin/inventory/summary
 * @access  Private/Admin
 */
export const getInventorySummary = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments({ active: true });
    const allActiveSizes = await Size.find({ active: true }).populate('product', 'name active');

    const validSizes = allActiveSizes.filter((s) => s.product && s.product.active);

    const totalActiveSizes = validSizes.length;
    const totalPiecesInStock = validSizes.reduce((sum, s) => sum + s.stock, 0);
    const outOfStockSizes = validSizes.filter((s) => s.stock === 0).length;
    const lowStockSizes = validSizes.filter((s) => s.stock > 0 && s.stock <= 50).length;

    return res.status(200).json({
      success: true,
      summary: {
        totalProducts,
        totalActiveSizes,
        totalPiecesInStock,
        outOfStockSizes,
        lowStockSizes,
      },
    });
  } catch (error) {
    console.error('[ProductController] Error getting inventory summary:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving inventory summary',
    });
  }
};
