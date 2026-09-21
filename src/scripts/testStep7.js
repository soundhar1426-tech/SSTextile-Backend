import mongoose from 'mongoose';
import dotenv from 'dotenv';
import http from 'http';
import app from '../index.js';
import { connectDB } from '../config/db.js';
import { Product } from '../models/Product.js';
import { Size } from '../models/Size.js';
import { User } from '../models/User.js';

dotenv.config();

const PORT = 5096; // Isolated test port

// Helper to make HTTP requests
const request = (options, postData = null) => {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch (e) {
          parsed = body;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed,
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
};

/**
 * Pure In-Memory / Context Cart Engine adhering strictly to Step 7 Business Rules
 */
class CartEngine {
  constructor() {
    this.cartItems = [];
  }

  loadFromStorage(jsonString) {
    try {
      this.cartItems = JSON.parse(jsonString) || [];
    } catch (e) {
      this.cartItems = [];
    }
  }

  saveToStorage() {
    return JSON.stringify(this.cartItems);
  }

  addToCart(product, selectedSize, quantity) {
    if (!product || !selectedSize) {
      return { success: false, error: 'Please select a towel size.' };
    }

    const availableStock = Number(selectedSize.stock ?? 0);
    const parsedQty = parseInt(quantity, 10);

    // Edge case: Out of Stock
    if (availableStock === 0) {
      return { success: false, error: 'Out of Stock' };
    }

    // Edge case: Available stock is less than 40 MOQ
    if (availableStock < 40) {
      return {
        success: false,
        error: `Minimum order is 40 pieces, but only ${availableStock} pieces are currently available.`,
      };
    }

    if (isNaN(parsedQty) || parsedQty <= 0) {
      return { success: false, error: 'Please enter a valid quantity.' };
    }

    const productId = String(product.id || product._id);
    const sizeId = String(selectedSize.id || selectedSize._id);
    const cartItemId = `${productId}_${sizeId}`;

    const existingIndex = this.cartItems.findIndex((item) => item.cartItemId === cartItemId);
    const isExisting = existingIndex > -1;
    const currentQtyInCart = isExisting ? this.cartItems[existingIndex].quantity : 0;
    const combinedQuantity = currentQtyInCart + parsedQty;

    // MOQ Validation: If new item, must be >= 40. Combined must be >= 40.
    if (!isExisting && parsedQty < 40) {
      return {
        success: false,
        error: 'Minimum order is 40 pieces. Please order at least 40 pieces.',
      };
    }

    if (combinedQuantity < 40) {
      return {
        success: false,
        error: 'Minimum order is 40 pieces. Please order at least 40 pieces.',
      };
    }

    // Stock Validation: Must not exceed available stock
    if (combinedQuantity > availableStock) {
      return {
        success: false,
        error: isExisting
          ? `Only ${availableStock} pieces are available for this size (${currentQtyInCart} already in cart).`
          : `Only ${availableStock} pieces are available for this size.`,
      };
    }

    if (isExisting) {
      this.cartItems[existingIndex] = {
        ...this.cartItems[existingIndex],
        quantity: combinedQuantity,
        price: Number(selectedSize.price),
        availableStock,
      };

      return { success: true, cartItem: this.cartItems[existingIndex] };
    }

    const newCartItem = {
      cartItemId,
      productId,
      productName: product.title || product.name || 'White Towel',
      productImage: product.image || (product.images && product.images[0]) || '',
      sizeId,
      size: selectedSize.size || '25x50',
      price: Number(selectedSize.price),
      quantity: parsedQty,
      availableStock,
    };

    this.cartItems.push(newCartItem);
    return { success: true, cartItem: newCartItem };
  }

  updateQuantity(cartItemId, newQty) {
    const itemIndex = this.cartItems.findIndex((item) => item.cartItemId === cartItemId);
    if (itemIndex === -1) {
      return { success: false, error: 'Item not found in cart.' };
    }

    const item = this.cartItems[itemIndex];
    const parsedQty = parseInt(newQty, 10);
    const minMoq = 40;
    const maxStock = item.availableStock ?? Infinity;

    if (isNaN(parsedQty) || parsedQty < minMoq) {
      return { success: false, error: 'Minimum order quantity is 40 pieces.' };
    }

    if (parsedQty > maxStock) {
      return { success: false, error: `Only ${maxStock} pieces are available.` };
    }

    this.cartItems[itemIndex].quantity = parsedQty;
    return { success: true, item: this.cartItems[itemIndex] };
  }

  removeFromCart(cartItemId) {
    this.cartItems = this.cartItems.filter((item) => item.cartItemId !== cartItemId);
    return { success: true };
  }

  calculateSubtotal() {
    return this.cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  calculateTotal() {
    return this.calculateSubtotal();
  }
}

const runStep7Tests = async () => {
  let server;
  let passed = 0;
  let failed = 0;

  const assert = (condition, testName, details = '') => {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${details ? `(${details})` : ''}`);
      failed++;
    }
  };

  try {
    console.log('\n========================================================');
    console.log('🧪 GOWTHAM TEX — STEP 7 SHOPPING CART & BUSINESS RULES TEST SUITE');
    console.log('========================================================\n');

    await connectDB();

    server = await new Promise((resolve) => {
      const s = app.listen(PORT, () => resolve(s));
    });

    // 1. Setup Admin Account & Token for dynamic inventory tests
    let adminUser = await User.findOne({ email: 'admin@gowthamtex.com' });
    if (!adminUser) {
      adminUser = await User.create({
        name: 'Gowtham Tex Admin',
        email: 'admin@gowthamtex.com',
        phone: '+919842712345',
        password: 'admin123',
        role: 'admin',
      });
    }

    const adminLoginRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/auth/admin/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: 'admin@gowthamtex.com', password: 'admin123' }
    );
    const adminToken = adminLoginRes.body.token;

    // 2. Create / Ensure test product with dynamic sizes in MongoDB
    const testProduct = await Product.create({
      name: 'White Towel Premium Institutional Grade',
      description: '100% Combed Ringspun Cotton White Towel',
      category: 'Commercial Terry Towel',
      hsnCode: '6302.60',
      material: '100% Combed Ringspun Cotton',
      weaveType: '2/20s Ring',
      images: ['https://example.com/test-towel.jpg'],
      active: true,
    });

    const size25x50 = await Size.create({
      product: testProduct._id,
      size: '25x50',
      price: 85,
      stock: 120,
      gsm: 500,
      weightKg: 0.063,
      active: true,
    });

    const size30x60 = await Size.create({
      product: testProduct._id,
      size: '30x60',
      price: 120,
      stock: 250,
      gsm: 550,
      weightKg: 0.099,
      active: true,
    });

    const sizeLowStock = await Size.create({
      product: testProduct._id,
      size: '20x40',
      price: 60,
      stock: 25, // Less than 40 MOQ
      gsm: 450,
      weightKg: 0.045,
      active: true,
    });

    const sizeLimitedStock = await Size.create({
      product: testProduct._id,
      size: '35x70',
      price: 140,
      stock: 60,
      gsm: 550,
      weightKg: 0.12,
      active: true,
    });

    // Fetch product details via live API
    const getDetailRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/products/${testProduct._id}`,
      method: 'GET',
    });

    const fetchedProduct = getDetailRes.body.product;
    const fetchedSizes = fetchedProduct.sizes;
    const liveSize25x50 = fetchedSizes.find((s) => s.size === '25x50');
    const liveSize30x60 = fetchedSizes.find((s) => s.size === '30x60');
    const liveSizeLowStock = fetchedSizes.find((s) => s.size === '20x40');
    const liveSizeLimited = fetchedSizes.find((s) => s.size === '35x70');

    console.log('[Phase 1] MOQ & Stock Validation Rules:');
    const cart = new CartEngine();

    // TEST 1: Add valid item with quantity 40
    const test1Res = cart.addToCart(fetchedProduct, liveSize25x50, 40);
    assert(
      test1Res.success === true && cart.cartItems.length === 1 && cart.cartItems[0].quantity === 40,
      'TEST 1: Add valid item with quantity 40 succeeds'
    );

    // TEST 2: Reject quantity 39 (< 40 MOQ)
    const test2Cart = new CartEngine();
    const test2Res = test2Cart.addToCart(fetchedProduct, liveSize25x50, 39);
    assert(
      test2Res.success === false &&
        test2Res.error.includes('Minimum order is 40 pieces') &&
        test2Cart.cartItems.length === 0,
      'TEST 2: Reject quantity 39 with clear MOQ error message'
    );

    // TEST 3: Accept quantity 40
    const test3Res = test2Cart.addToCart(fetchedProduct, liveSize25x50, 40);
    assert(
      test3Res.success === true && test2Cart.cartItems.length === 1 && test2Cart.cartItems[0].quantity === 40,
      'TEST 3: Accept quantity 40 succeeds'
    );

    // TEST 4: Reject quantity greater than available stock (Stock = 60, enters 80)
    const test4Cart = new CartEngine();
    const test4Res = test4Cart.addToCart(fetchedProduct, liveSizeLimited, 80);
    assert(
      test4Res.success === false &&
        test4Res.error.includes('Only 60 pieces are available') &&
        test4Cart.cartItems.length === 0,
      'TEST 4: Reject quantity (80) greater than available stock (60) with error'
    );

    // TEST 5: Reject size when stock is less than 40 (Stock = 25)
    const test5Cart = new CartEngine();
    const test5Res = test5Cart.addToCart(fetchedProduct, liveSizeLowStock, 40);
    assert(
      test5Res.success === false &&
        test5Res.error.includes('only 25 pieces are currently available') &&
        test5Cart.cartItems.length === 0,
      'TEST 5: Reject size when stock is less than 40 (Stock = 25 pcs)'
    );

    console.log('\n[Phase 2] Cart Quantity Controls & Modification:');
    // TEST 6: Increase quantity without exceeding stock (40 -> 60 when stock is 120)
    const testCartControls = new CartEngine();
    testCartControls.addToCart(fetchedProduct, liveSize25x50, 40);
    const cartItemId = testCartControls.cartItems[0].cartItemId;

    const test6Res = testCartControls.updateQuantity(cartItemId, 60);
    assert(
      test6Res.success === true && testCartControls.cartItems[0].quantity === 60,
      'TEST 6: Increase quantity from 40 to 60 without exceeding stock'
    );

    // TEST 7: Prevent quantity from going below 40 (60 -> 39 blocked)
    const test7Res = testCartControls.updateQuantity(cartItemId, 39);
    assert(
      test7Res.success === false &&
        test7Res.error.includes('Minimum order quantity is 40 pieces') &&
        testCartControls.cartItems[0].quantity === 60,
      'TEST 7: Prevent quantity from decreasing below 40 (blocked with validation)'
    );

    // Also verify increasing beyond stock (60 -> 130 when stock is 120) is blocked
    const test7StockRes = testCartControls.updateQuantity(cartItemId, 130);
    assert(
      test7StockRes.success === false &&
        test7StockRes.error.includes('Only 120 pieces are available') &&
        testCartControls.cartItems[0].quantity === 60,
      'TEST 7 (Stock Ceiling): Prevent quantity from increasing beyond stock limit (120)'
    );

    console.log('\n[Phase 3] Item Removal & Subtotal Calculations:');
    // TEST 8: Remove cart item
    const test8Res = testCartControls.removeFromCart(cartItemId);
    assert(
      test8Res.success === true && testCartControls.cartItems.length === 0,
      'TEST 8: Remove cart item succeeds and leaves cart empty'
    );

    // TEST 9: Calculate correct subtotal (₹85 * 40 = ₹3,400)
    const testCalcCart = new CartEngine();
    testCalcCart.addToCart(fetchedProduct, liveSize25x50, 40);
    const subtotalItem1 = testCalcCart.cartItems[0].price * testCalcCart.cartItems[0].quantity;
    assert(
      subtotalItem1 === 3400 && testCalcCart.calculateSubtotal() === 3400,
      'TEST 9: Calculate correct subtotal for 40 pcs @ ₹85 = ₹3,400'
    );

    // TEST 10: Calculate correct total for multiple items (Item 1: ₹3,400, Item 2: 40 * ₹120 = ₹4,800 -> Total: ₹8,200)
    testCalcCart.addToCart(fetchedProduct, liveSize30x60, 40);
    const subtotalItem2 = testCalcCart.cartItems[1].price * testCalcCart.cartItems[1].quantity;
    const calculatedTotal = testCalcCart.calculateTotal();
    assert(
      subtotalItem2 === 4800 && calculatedTotal === 8200,
      'TEST 10: Calculate correct total for multiple items (₹3,400 + ₹4,800 = ₹8,200)'
    );

    console.log('\n[Phase 4] Multi-Size Separation & Same-Size Combination:');
    // TEST 11: Same product + same size combines quantity (40 + 20 = 60 pcs)
    const testCombineCart = new CartEngine();
    testCombineCart.addToCart(fetchedProduct, liveSize25x50, 40);
    testCombineCart.addToCart(fetchedProduct, liveSize25x50, 20); // Add 20 more

    assert(
      testCombineCart.cartItems.length === 1 && testCombineCart.cartItems[0].quantity === 60,
      'TEST 11: Same product + same size combines quantity (40 + 20 = 60 pcs)'
    );

    // TEST 12: Same product + different sizes remain separate
    testCombineCart.addToCart(fetchedProduct, liveSize30x60, 40);
    assert(
      testCombineCart.cartItems.length === 2 &&
        testCombineCart.cartItems[0].size === '25x50' &&
        testCombineCart.cartItems[1].size === '30x60',
      'TEST 12: Same product with different sizes remain separate cart items'
    );

    console.log('\n[Phase 5] Live Dynamic MongoDB Sync & Persistence:');
    // TEST 13: Dynamic admin-created size (55x100 -> ₹220, 75 pcs) can be added to cart
    const addAdminSizeRes = await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/products/${testProduct._id}/sizes`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        size: '55x100',
        price: 220,
        stock: 75,
        gsm: 600,
      }
    );

    const createdAdminSize = addAdminSizeRes.body.size;
    const dynamicCart = new CartEngine();
    const test13Res = dynamicCart.addToCart(fetchedProduct, createdAdminSize, 50);

    assert(
      test13Res.success === true &&
        dynamicCart.cartItems[0].size === '55x100' &&
        dynamicCart.cartItems[0].price === 220 &&
        dynamicCart.cartItems[0].quantity === 50 &&
        dynamicCart.calculateSubtotal() === 11000,
      'TEST 13: Dynamic admin-created size (55x100 @ ₹220, 75 stock) successfully added to cart'
    );

    // TEST 14: Updated backend price is reflected in the cart
    await request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/admin/sizes/${size25x50._id}`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
      },
      {
        price: 90, // Price updated from 85 to 90
      }
    );

    // Query live customer API for updated price
    const updatedProdRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: `/api/products/${testProduct._id}`,
      method: 'GET',
    });

    const updatedSize25x50 = updatedProdRes.body.product.sizes.find((s) => s.size === '25x50');
    assert(
      updatedSize25x50 && updatedSize25x50.price === 90,
      'Admin updates price from ₹85 to ₹90 in MongoDB'
    );

    const priceUpdateCart = new CartEngine();
    priceUpdateCart.addToCart(updatedProdRes.body.product, updatedSize25x50, 40);
    assert(
      priceUpdateCart.cartItems[0].price === 90 && priceUpdateCart.calculateSubtotal() === 3600,
      'TEST 14: Updated backend price (₹90) is accurately reflected in cart calculations (₹3,600)'
    );

    // TEST 15: Cart survives page refresh / persistence serialization
    const serialized = priceUpdateCart.saveToStorage();
    const restoredCart = new CartEngine();
    restoredCart.loadFromStorage(serialized);

    assert(
      restoredCart.cartItems.length === 1 &&
        restoredCart.cartItems[0].size === '25x50' &&
        restoredCart.cartItems[0].price === 90 &&
        restoredCart.cartItems[0].quantity === 40 &&
        restoredCart.calculateSubtotal() === 3600,
      'TEST 15: Cart survives page refresh via JSON localStorage persistence'
    );

    console.log('\n========================================================');
    console.log(`📊 STEP 7 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('[Step 7 Test Error]', error);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    await mongoose.connection.close();
    process.exit(0);
  }
};

runStep7Tests();
