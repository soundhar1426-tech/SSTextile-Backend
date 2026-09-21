import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { User, Product, Size, Order, Invoice } from '../models/index.js';
import { confirmOrderPayment, getAllOrders } from '../controllers/adminOrderController.js';
import { createOrder, getOrderById, getOrderInvoice } from '../controllers/orderController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const runIntegrationTest = async () => {
  console.log('--- Starting Order & Bill Confirmation Integration Test ---');
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/gowtham_tex';
  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB:', mongoose.connection.name);

  try {
    // 1. Find or create test customer & admin
    let customer = await User.findOne({ role: 'customer' });
    if (!customer) {
      customer = await User.create({
        name: 'Test Buyer Store',
        email: 'testbuyer@sstextiles.com',
        phone: '9842112345',
        role: 'customer',
        businessName: 'Grand Royal Textiles',
        gstin: '33AAACG0189M1Z8',
        address: '123 Market Road',
        city: 'Erode',
        state: 'Tamil Nadu',
        stateCode: '33',
        pincode: '638001',
      });
    }

    let admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      admin = await User.create({
        name: 'Mill Admin',
        email: 'admin@sstextiles.com',
        phone: '9489040067',
        role: 'admin',
      });
    }

    // 2. Find an active Product & Size
    let product = await Product.findOne({ active: true });
    let size = await Size.findOne({ active: true });

    if (!product || !size) {
      console.log('Seeding minimal product & size for test...');
      product = await Product.create({
        name: 'White Jacquard Towel',
        category: 'Terry Towels',
        active: true,
        hsnCode: '6302.60',
      });
      size = await Size.create({
        product: product._id,
        size: '30x60',
        price: 150,
        stock: 500,
        active: true,
      });
    }

    // 3. Simulate Buyer placing an order (POST /api/orders)
    console.log('\n1. Simulating Buyer placing wholesale order (100 pcs)...');
    const orderData = {
      customerDetails: {
        name: customer.name,
        businessName: customer.businessName || 'Grand Royal Textiles',
        phone: customer.phone,
        email: customer.email,
        gstin: customer.gstin || '33AAACG0189M1Z8',
      },
      deliveryDetails: {
        addressLine1: '123 Market Road',
        city: 'Erode',
        state: 'Tamil Nadu',
        stateCode: '33',
        pincode: '638001',
        contactPhone: customer.phone,
        transporter: 'VRL Logistics Cargo',
      },
      items: [
        {
          productId: product._id,
          productName: product.name,
          sizeId: size._id,
          size: size.size,
          quantity: 100,
        },
      ],
      discount: 0,
      tax: 750,
    };

    const mockReqOrder = {
      user: customer,
      body: orderData,
    };

    let createdOrder = null;
    const mockResOrder = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        if (data.success) {
          createdOrder = data.order;
        } else {
          console.error('Order creation failed:', data);
        }
        return this;
      },
    };

    await createOrder(mockReqOrder, mockResOrder);
    if (!createdOrder) throw new Error('Order creation test failed');

    console.log(`✓ Order placed successfully! Order #: ${createdOrder.orderNumber}, Status: ${createdOrder.orderStatus}, Payment: ${createdOrder.paymentStatus}, Total: ₹${createdOrder.totalAmount}`);

    // 4. Verify Admin retrieves newly placed order (GET /api/admin/orders)
    console.log('\n2. Simulating Admin fetching wholesale orders list...');
    const mockReqAdminList = {
      user: admin,
      query: {},
    };
    let adminOrdersList = [];
    const mockResAdminList = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        if (data.success) {
          adminOrdersList = data.orders;
        }
        return this;
      },
    };

    await getAllOrders(mockReqAdminList, mockResAdminList);
    const foundInAdmin = adminOrdersList.find((o) => o._id.toString() === createdOrder._id.toString());
    if (!foundInAdmin) throw new Error('Newly created order not found in admin list!');
    console.log(`✓ Admin successfully retrieved placed order #${foundInAdmin.orderNumber} with status: ${foundInAdmin.orderStatus}`);

    // 5. Simulate Admin checking the bill and confirming payment (PATCH /api/admin/orders/:id/payment)
    console.log('\n3. Simulating Admin checking bill and confirming payment & invoice generation...');
    const mockReqConfirm = {
      user: admin,
      params: { id: createdOrder._id.toString() },
      body: {
        paymentMethod: 'UPI',
        paymentReference: 'UPI-REF-987654321',
        amount: createdOrder.totalAmount,
      },
    };

    let confirmedOrder = null;
    let generatedInvoice = null;
    const mockResConfirm = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        if (data.success) {
          confirmedOrder = data.order;
          generatedInvoice = data.invoice;
        } else {
          console.error('Payment confirmation error:', data);
        }
        return this;
      },
    };

    await confirmOrderPayment(mockReqConfirm, mockResConfirm);
    if (!confirmedOrder || !generatedInvoice) throw new Error('Payment confirmation or invoice generation failed!');

    console.log(`✓ Payment confirmed! Order status: ${confirmedOrder.orderStatus}, Payment status: ${confirmedOrder.paymentStatus}`);
    console.log(`✓ Official GST Tax Invoice Generated: #${generatedInvoice.invoiceNumber}`);
    console.log(`  - Mill GSTIN: ${generatedInvoice.millGstin}`);
    console.log(`  - Buyer GSTIN: ${generatedInvoice.customerDetails?.gstin}`);
    console.log(`  - Total Amount: ₹${generatedInvoice.totalAmount}`);

    // 6. Simulate Buyer retrieving their confirmed invoice (GET /api/orders/:id/invoice)
    console.log('\n4. Simulating Buyer viewing the confirmed GST Tax Invoice in Buyer Portal...');
    const mockReqBuyerInv = {
      user: customer,
      params: { id: createdOrder._id.toString() },
    };

    let buyerViewInvoice = null;
    const mockResBuyerInv = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        if (data.success) {
          buyerViewInvoice = data.invoice;
        }
        return this;
      },
    };

    await getOrderInvoice(mockReqBuyerInv, mockResBuyerInv);
    if (!buyerViewInvoice) throw new Error('Buyer invoice retrieval failed!');

    console.log(`✓ Buyer successfully accessed confirmed GST Tax Invoice #${buyerViewInvoice.invoiceNumber}!`);
    console.log(`  - Invoice Status: ${buyerViewInvoice.paymentStatus}`);
    console.log(`  - Item Count: ${buyerViewInvoice.items?.length}`);
    console.log(`  - Grand Total: ₹${buyerViewInvoice.totalAmount}`);

    console.log('\n========================================');
    console.log('🎉 ALL INTEGRATION TESTS PASSED 100%! 🎉');
    console.log('========================================');
  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    await mongoose.disconnect();
  }
};

runIntegrationTest();
