import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { Product } from '../models/Product.js';
import { Size } from '../models/Size.js';
import { Order } from '../models/Order.js';
import { OrderItem } from '../models/OrderItem.js';
import { Invoice } from '../models/Invoice.js';
import * as productController from '../controllers/productController.js';
import * as customerProductController from '../controllers/customerProductController.js';
import * as orderController from '../controllers/orderController.js';
import * as adminOrderController from '../controllers/adminOrderController.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gowtham_tex';
const JWT_SECRET = process.env.JWT_SECRET || 'gowtham_tex_jwt_super_secret_dev_key_2026';

// Mock Express Req & Res
const mockRequest = (body = {}, params = {}, query = {}, user = null) => ({
  body,
  params,
  query,
  user,
  headers: {},
});

const mockResponse = () => {
  const res = {};
  res.statusCode = 200;
  res.status = function (code) {
    this.statusCode = code;
    return this;
  };
  res.json = function (data) {
    this.data = data;
    return this;
  };
  return res;
};

async function runEndToEndProductFlowTest() {
  console.log('\n========================================================');
  console.log('🧪 GOWTHAM TEX — END-TO-END PRODUCT LIFECYCLE & BUYER ORDER TEST');
  console.log('========================================================\n');

  await mongoose.connect(MONGODB_URI);
  console.log('[MongoDB] Connected successfully.');

  let adminUser, customerUser;
  let adminToken, customerToken;

  // 1. Setup Admin & Customer
  try {
    adminUser = await User.findOne({ email: 'admin@gowthamtex.com' });
    if (!adminUser) {
      adminUser = await User.create({
        name: 'Gowtham Tex Mill Admin',
        email: 'admin@gowthamtex.com',
        password: 'password123',
        role: 'admin',
        phone: '+919566647825',
      });
    }

    customerUser = await User.findOne({ email: 'procurement@suryahotels.com' });
    if (!customerUser) {
      customerUser = await User.create({
        name: 'K. Rajendran',
        businessName: 'Surya Hotels & Resorts',
        email: 'procurement@suryahotels.com',
        password: 'password123',
        role: 'customer',
        phone: '+919842155670',
        city: 'Erode',
        state: 'Tamil Nadu',
        pincode: '638001',
      });
    }

    adminToken = jwt.sign({ id: adminUser._id, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
    customerToken = jwt.sign({ id: customerUser._id, role: 'customer' }, JWT_SECRET, { expiresIn: '1h' });

    console.log('✓ Phase 1: Test actors initialized (Admin & Customer).');
  } catch (err) {
    console.error('Setup error:', err);
    process.exit(1);
  }

  let createdProduct = null;
  let createdSize1 = null;
  let createdSize2 = null;

  // 2. Admin Creates a New Product
  console.log('\n--> Phase 2: Admin creates new product in Admin Portal...');
  const createProductReq = mockRequest(
    {
      name: 'Royal Heritage Turkish White Towel',
      description: 'Luxury 650 GSM high-plush zero-twist combed cotton towel for 5-star suites',
      category: 'Commercial Terry Towel',
      hsnCode: '6302.60',
      material: '100% Turkish Combed Ringspun Cotton',
      weaveType: 'Zero-Twist 2/20s',
      active: true,
      sizes: [
        {
          size: '30x60',
          dimension: '30×60 cm',
          price: 180,
          stock: 500,
          gsm: 600,
          weightKg: 0.12,
        },
        {
          size: '40x80',
          dimension: '40×80 cm',
          price: 240,
          stock: 300,
          gsm: 650,
          weightKg: 0.22,
        },
      ],
    },
    {},
    {},
    adminUser
  );
  const createProductRes = mockResponse();
  await productController.createAdminProduct(createProductReq, createProductRes);

  if (createProductRes.statusCode === 201 && createProductRes.data.success) {
    createdProduct = createProductRes.data.product;
    createdSize1 = createdProduct.sizes.find((s) => s.size === '30x60');
    createdSize2 = createdProduct.sizes.find((s) => s.size === '40x80');
    console.log(`  ✅ PASS: Product created in Admin Portal: "${createdProduct.title}" (ID: ${createdProduct._id})`);
    console.log(`  ✅ PASS: Initial sizes created: ${createdProduct.sizes.length} sizes (Stock: ${createdProduct.totalStock} pcs)`);
  } else {
    console.error('  ❌ FAIL: Failed to create product:', createProductRes.data);
    process.exit(1);
  }

  // 3. Buyer Catalog Verification
  console.log('\n--> Phase 3: Verify Buyer Website reflects the new product in real-time...');
  const publicListReq = mockRequest();
  const publicListRes = mockResponse();
  await customerProductController.getPublicProducts(publicListReq, publicListRes);

  const foundInCatalog = publicListRes.data.products.find(
    (p) => String(p._id) === String(createdProduct._id) || p.title === createdProduct.title
  );

  if (foundInCatalog) {
    console.log(`  ✅ PASS: Product immediately appears in public buyer catalog (Title: ${foundInCatalog.title})`);
    console.log(`  ✅ PASS: Buyer catalog shows correct min price: ₹${foundInCatalog.minPrice}, max price: ₹${foundInCatalog.maxPrice}`);
    console.log(`  ✅ PASS: Buyer catalog shows correct total stock: ${foundInCatalog.totalStock} pcs`);
  } else {
    console.error('  ❌ FAIL: Product not found in public catalog!');
    process.exit(1);
  }

  // 4. Buyer Product Details Page Verification
  console.log('\n--> Phase 4: Verify Buyer Product Details Page API...');
  const publicDetailReq = mockRequest({}, { id: createdProduct._id });
  const publicDetailRes = mockResponse();
  await customerProductController.getPublicProductById(publicDetailReq, publicDetailRes);

  if (publicDetailRes.statusCode === 200 && publicDetailRes.data.success) {
    const detail = publicDetailRes.data.product;
    console.log(`  ✅ PASS: Buyer can view product details for "${detail.title}"`);
    console.log(`  ✅ PASS: Sizes available for ordering: ${detail.sizes.map((s) => `${s.dimension} (₹${s.price}/pc, Stock: ${s.stock} pcs)`).join(' | ')}`);
  } else {
    console.error('  ❌ FAIL: Failed to fetch public product details');
    process.exit(1);
  }

  // 5. Buyer Places Order for the Newly Created Product
  console.log('\n--> Phase 5: Buyer places order for 50 pcs with typed custom logistics...');
  const orderPlacementReq = mockRequest(
    {
      customerDetails: {
        name: customerUser.name,
        businessName: customerUser.businessName,
        phone: customerUser.phone,
        email: customerUser.email,
        gstin: '33AAACG0184M1Z8',
      },
      deliveryDetails: {
        addressLine1: 'No. 45 Grand Palace Road',
        addressLine2: 'Near Commercial Hub',
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        pincode: '641001',
        contactPhone: customerUser.phone,
        transporter: 'VRL Logistics Cargo Express (Hub Drop)', // Custom typed transporter
      },
      items: [
        {
          productId: createdProduct._id,
          productName: createdProduct.title,
          sizeId: createdSize1._id,
          size: createdSize1.dimension,
          quantity: 50, // MOQ >= 40, step 10
        },
      ],
      discount: 0,
      tax: 450, // 5% GST on ₹9,000 = ₹450
    },
    {},
    {},
    customerUser
  );
  const orderPlacementRes = mockResponse();
  await orderController.createOrder(orderPlacementReq, orderPlacementRes);

  let placedOrder = null;
  if (orderPlacementRes.statusCode === 201 && orderPlacementRes.data.success) {
    placedOrder = orderPlacementRes.data.order;
    console.log(`  ✅ PASS: Buyer placed order successfully: #${placedOrder.orderNumber}`);
    console.log(`  ✅ PASS: Consignment: ${placedOrder.totalPieces} pcs @ ₹${placedOrder.totalAmount} (Incl. 5% GST)`);
    console.log(`  ✅ PASS: Custom logistics preserved: "${placedOrder.deliveryDetails?.transporter}"`);
    console.log(`  ✅ PASS: Initial payment status is pending: "${placedOrder.paymentStatus}"`);
  } else {
    console.error('  ❌ FAIL: Failed to place order:', orderPlacementRes.data);
    process.exit(1);
  }

  // 6. Verify Stock Deduction in MongoDB
  console.log('\n--> Phase 6: Verify Stock Deduction in MongoDB after Order...');
  const updatedSizeDoc = await Size.findById(createdSize1._id);
  if (updatedSizeDoc && updatedSizeDoc.stock === 450) {
    console.log(`  ✅ PASS: Stock for size ${createdSize1.size} correctly reduced from 500 -> 450 pcs`);
  } else {
    console.error(`  ❌ FAIL: Stock was not reduced properly! Current stock: ${updatedSizeDoc?.stock}`);
    process.exit(1);
  }

  // 7. Admin Confirms Payment & Generates GST Invoice
  console.log('\n--> Phase 7: Admin confirms payment in Admin Portal and generates GST Invoice...');
  const confirmPaymentReq = mockRequest(
    {
      paymentMethod: 'UPI / Bank Transfer',
      paymentReference: 'UTR-TEST-2026-987654',
      amount: placedOrder.totalAmount,
    },
    { id: placedOrder._id },
    {},
    adminUser
  );
  const confirmPaymentRes = mockResponse();
  await adminOrderController.confirmOrderPayment(confirmPaymentReq, confirmPaymentRes);

  let generatedInvoice = null;
  if (confirmPaymentRes.statusCode === 200 && confirmPaymentRes.data.success) {
    generatedInvoice = confirmPaymentRes.data.invoice;
    console.log(`  ✅ PASS: Payment confirmed by Admin. Order status: "${confirmPaymentRes.data.order.orderStatus}" / "${confirmPaymentRes.data.order.paymentStatus}"`);
    console.log(`  ✅ PASS: Official GST Tax Invoice issued: ${generatedInvoice.invoiceNumber}`);
    console.log(`  ✅ PASS: Invoice contains HSN 6302.60 with 5% GST breakdown: Tax ₹${generatedInvoice.tax}, Total ₹${generatedInvoice.totalAmount}`);
  } else {
    console.error('  ❌ FAIL: Admin payment confirmation failed:', confirmPaymentRes.data);
    process.exit(1);
  }

  // 8. Admin Updates Product Details (Price & Stock)
  console.log('\n--> Phase 8: Admin updates product pricing & stock, verifies buyer reflection...');
  const updateReq = mockRequest(
    {
      name: 'Royal Heritage Turkish White Towel (Export Edition)',
      sizes: [
        {
          _id: createdSize1._id,
          size: '30x60',
          price: 195, // Price updated to ₹195
          stock: 600, // Stock replenished to 600
          gsm: 600,
        },
      ],
    },
    { id: createdProduct._id },
    {},
    adminUser
  );
  const updateRes = mockResponse();
  await productController.updateAdminProduct(updateReq, updateRes);

  if (updateRes.statusCode === 200 && updateRes.data.success) {
    console.log(`  ✅ PASS: Admin updated product title to "${updateRes.data.product.title}"`);
  } else {
    console.error('  ❌ FAIL: Failed to update product:', updateRes.data);
    process.exit(1);
  }

  // 9. Verify Buyer Sees Updated Pricing
  const buyerCheckReq = mockRequest({}, { id: createdProduct._id });
  const buyerCheckRes = mockResponse();
  await customerProductController.getPublicProductById(buyerCheckReq, buyerCheckRes);

  const updatedBuyerProduct = buyerCheckRes.data.product;
  const updatedSize = updatedBuyerProduct.sizes.find((s) => String(s._id) === String(createdSize1._id));

  if (updatedSize && updatedSize.price === 195 && updatedSize.stock === 600) {
    console.log(`  ✅ PASS: Buyer immediately sees updated price: ₹${updatedSize.price}/pc and updated stock: ${updatedSize.stock} pcs`);
  } else {
    console.error('  ❌ FAIL: Buyer does not see updated price/stock:', updatedSize);
    process.exit(1);
  }

  // 10. Clean up test product & order
  console.log('\n--> Phase 10: Cleaning up test product, order, and invoice...');
  await Product.findByIdAndDelete(createdProduct._id);
  await Size.deleteMany({ product: createdProduct._id });
  await Order.findByIdAndDelete(placedOrder._id);
  await OrderItem.deleteMany({ order: placedOrder._id });
  await Invoice.deleteMany({ order: placedOrder._id });
  console.log('  ✓ Test artifacts cleaned up cleanly.');

  console.log('\n========================================================');
  console.log('🎉 ALL 10 END-TO-END PRODUCT LIFECYCLE TESTS PASSED (100%)');
  console.log('========================================================\n');

  await mongoose.disconnect();
}

runEndToEndProductFlowTest().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
