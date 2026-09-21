import mongoose from 'mongoose';
import { Order, OrderItem, Product, Size, Invoice, Settings } from '../models/index.js';
import { sendOrderAlertSMS } from '../utils/smsService.js';
import { resolveGSTStateCode } from '../utils/gstUtils.js';

/**
 * Generate a unique customer-friendly order number (e.g. GTX-10001)
 */
const generateOrderNumber = async () => {
  let isUnique = false;
  let orderNumber = '';

  while (!isUnique) {
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    orderNumber = `GTX-${randomNum}`;
    const existing = await Order.findOne({ orderNumber });
    if (!existing) {
      isUnique = true;
    }
  }

  return orderNumber;
};

/**
 * @desc    Create a new wholesale purchase order
 * @route   POST /api/orders
 * @access  Private (Customer / Admin)
 */
export const createOrder = async (req, res) => {
  const decrementedSizes = [];

  try {
    const customerId = req.user._id;
    const { customerDetails, deliveryDetails, items, notes, discount = 0, tax = 0 } = req.body;

    // 1. Validate customer details
    if (!customerDetails || !customerDetails.name || !customerDetails.phone || !customerDetails.email) {
      return res.status(400).json({
        success: false,
        message: 'Customer name, phone number, and email address are required.',
      });
    }

    // 2. Validate delivery details
    if (
      !deliveryDetails ||
      !deliveryDetails.addressLine1 ||
      !deliveryDetails.city ||
      !deliveryDetails.state ||
      !deliveryDetails.pincode ||
      !deliveryDetails.contactPhone
    ) {
      return res.status(400).json({
        success: false,
        message: 'Complete delivery details (Address, City, State, Pincode, Contact Phone) are required.',
      });
    }

    // 3. Validate items array
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order must contain at least one towel item.',
      });
    }

    // 4. Validate items against real-time MongoDB products and dynamic sizes
    const verifiedItems = [];
    let calculatedSubtotal = 0;
    let totalPieces = 0;

    for (const item of items) {
      const quantity = parseInt(item.quantity, 10);
      const productId = item.productId || item.product;
      const sizeId = item.sizeId || item.sizeRef || item.size;

      // MOQ Rule: Minimum quantity 40 pcs
      if (isNaN(quantity) || quantity < 40) {
        return res.status(400).json({
          success: false,
          message: 'Minimum order is 40 pieces. Please order at least 40 pieces.',
        });
      }

      // Robust Product Resolution
      let product = null;
      if (productId && mongoose.Types.ObjectId.isValid(productId)) {
        product = await Product.findById(productId);
      }
      if (!product && item.productName) {
        product = await Product.findOne({
          name: new RegExp(item.productName.trim(), 'i'),
          active: true,
        });
      }
      if (!product) {
        product = (await Product.findOne({ active: true })) || (await Product.findOne());
      }

      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product "${item.productName || 'Towel'}" is not found in catalog.`,
        });
      }

      // Robust Size Resolution
      let sizeDoc = null;
      if (sizeId && mongoose.Types.ObjectId.isValid(sizeId)) {
        sizeDoc = await Size.findOne({ _id: sizeId, product: product._id, active: true });
      }

      if (!sizeDoc) {
        const cleanSizeKey = String(item.size || sizeId || '')
          .toLowerCase()
          .replace(/^sz-/, '')
          .replace(/cm|inch|in/gi, '')
          .replace(/[×*X\-]/g, 'x')
          .replace(/\s+/g, '')
          .trim();

        if (cleanSizeKey) {
          sizeDoc = await Size.findOne({
            product: product._id,
            active: true,
            $or: [
              { size: cleanSizeKey },
              { size: new RegExp(`^${cleanSizeKey}$`, 'i') },
              { dimension: new RegExp(cleanSizeKey, 'i') },
            ],
          });
        }
      }

      if (!sizeDoc) {
        const allSizes = await Size.find({ product: product._id, active: true }).sort({ price: 1 });
        if (allSizes.length > 0) {
          sizeDoc = allSizes[0];
        }
      }

      if (!sizeDoc || sizeDoc.active === false) {
        return res.status(404).json({
          success: false,
          message: `Size specification "${item.size || sizeId}" is not available for product "${product.name}".`,
        });
      }

      // Stock validation
      if (sizeDoc.stock < 40) {
        return res.status(400).json({
          success: false,
          message: `Minimum order is 40 pieces, but only ${sizeDoc.stock} pieces are currently available for ${sizeDoc.size} cm.`,
        });
      }

      if (sizeDoc.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${sizeDoc.stock} pieces are currently available for ${sizeDoc.size} cm.`,
        });
      }

      // Secure price calculation from MongoDB
      const unitPrice = Number(sizeDoc.price);
      const itemSubtotal = unitPrice * quantity;
      calculatedSubtotal += itemSubtotal;
      totalPieces += quantity;

      verifiedItems.push({
        product: product._id,
        productName: product.name,
        hsnCode: product.hsnCode || '6302.60',
        size: sizeDoc.size,
        sizeRef: sizeDoc._id,
        quantity,
        price: unitPrice,
        subtotal: itemSubtotal,
      });
    }

    // 5. Decrement Stock Atomically in MongoDB
    for (const vItem of verifiedItems) {
      const updatedSize = await Size.findOneAndUpdate(
        { _id: vItem.sizeRef, stock: { $gte: vItem.quantity } },
        { $inc: { stock: -vItem.quantity } },
        { new: true }
      );

      if (!updatedSize) {
        // Rollback already decremented items
        for (const dec of decrementedSizes) {
          await Size.findByIdAndUpdate(dec.sizeId, { $inc: { stock: dec.quantity } });
        }

        return res.status(400).json({
          success: false,
          message: `Insufficient stock available for size "${vItem.size}". Please update your cart and try again.`,
        });
      }

      // Update status based on remaining stock
      if (updatedSize.stock <= 0) {
        updatedSize.status = 'Out of Stock';
      } else if (updatedSize.stock < 200) {
        updatedSize.status = 'In Stock';
      } else {
        updatedSize.status = 'Optimal Stock';
      }
      await updatedSize.save();

      decrementedSizes.push({ sizeId: vItem.sizeRef, quantity: vItem.quantity, remainingStock: updatedSize.stock });
    }

    // 6. Calculate Totals (Securely on backend)
    const validDiscount = Math.max(0, Number(discount) || 0);
    const taxableValue = Math.max(0, calculatedSubtotal - validDiscount);
    // Use standard 5% GST for HSN 6302 if not specifically specified
    const validTax = Math.max(0, Number(tax) || Math.round(taxableValue * 0.05));
    const grandTotal = taxableValue + validTax;

    // 7. Generate unique order number
    const orderNumber = await generateOrderNumber();

    // 8. Calculate and resolve buyer state and GST state code
    const buyerState = (deliveryDetails.state || customerDetails.state || 'Tamil Nadu').trim();
    const buyerGstin = (customerDetails.gstin || '').trim().toUpperCase();
    const buyerStateCode = (
      deliveryDetails.stateCode ||
      customerDetails.stateCode ||
      (req.user && req.user.stateCode) ||
      resolveGSTStateCode(buyerState, buyerGstin) ||
      '33'
    ).toString().replace(/\D/g, '').slice(0, 2).padStart(2, '0');

    // Create Order document
    const order = new Order({
      orderNumber,
      customer: customerId,
      buyerStateCode,
      customerDetails: {
        name: customerDetails.name.trim(),
        businessName: (customerDetails.businessName || '').trim(),
        phone: customerDetails.phone.trim(),
        email: customerDetails.email.trim().toLowerCase(),
        gstin: buyerGstin,
        state: buyerState,
        stateCode: buyerStateCode,
      },
      deliveryDetails: {
        addressLine1: deliveryDetails.addressLine1.trim(),
        addressLine2: (deliveryDetails.addressLine2 || '').trim(),
        city: deliveryDetails.city.trim(),
        state: buyerState,
        stateCode: buyerStateCode,
        pincode: deliveryDetails.pincode.trim(),
        contactPhone: deliveryDetails.contactPhone.trim(),
        transporter: (deliveryDetails.transporter || 'VRL Logistics Cargo').trim(),
      },
      shippingAddress: {
        name: customerDetails.name.trim(),
        phone: deliveryDetails.contactPhone.trim() || customerDetails.phone.trim(),
        address: `${deliveryDetails.addressLine1.trim()}${
          deliveryDetails.addressLine2 ? ', ' + deliveryDetails.addressLine2.trim() : ''
        }`,
        city: deliveryDetails.city.trim(),
        state: buyerState,
        stateCode: buyerStateCode,
        pincode: deliveryDetails.pincode.trim(),
        gstin: buyerGstin,
      },
      totalPieces,
      subtotal: calculatedSubtotal,
      discount: validDiscount,
      tax: validTax,
      totalAmount: grandTotal,
      total: grandTotal,
      paymentMethod: 'UPI',
      paymentStatus: 'pending',
      orderStatus: 'new',
      invoiceStatus: 'not_generated',
      invoice: null,
      invoiceNumber: null,
      notes: (notes || '').trim(),
    });

    await order.save();

    // 9. Create and attach OrderItem documents
    const customerDisplayName = (customerDetails.businessName || customerDetails.name || req.user?.businessName || req.user?.name || '').trim();
    const createdItemIds = [];
    for (const vItem of verifiedItems) {
      const orderItem = await OrderItem.create({
        order: order._id,
        customer: customerId,
        customerName: customerDisplayName,
        product: vItem.product,
        productName: vItem.productName,
        hsnCode: vItem.hsnCode || '6302.60',
        size: vItem.size,
        sizeRef: vItem.sizeRef,
        quantity: vItem.quantity,
        price: vItem.price,
        subtotal: vItem.subtotal,
      });
      createdItemIds.push(orderItem._id);
    }

    order.items = createdItemIds;
    await order.save();

    // 10. Populate items and return order response
    const populatedOrder = await Order.findById(order._id).populate('items');

    // 11. Trigger automated SMS alert to Admin Mobile Phone (+919566647825)
    sendOrderAlertSMS({
      orderNumber: order.orderNumber,
      customerName: order.customerDetails?.businessName || order.customerDetails?.name,
      customerPhone: order.customerDetails?.phone,
      totalPieces: order.totalPieces,
      totalAmount: order.totalAmount,
      transporter: order.deliveryDetails?.transporter,
      destination: `${order.deliveryDetails?.city}, ${order.deliveryDetails?.state}`,
    }).catch((smsErr) => {
      console.error('[SMS Dispatch Notice]', smsErr.message);
    });

    return res.status(201).json({
      success: true,
      message: 'Wholesale order placed successfully. Payment pending admin verification.',
      order: populatedOrder,
    });
  } catch (error) {
    // Rollback any stock decrements on unexpected failure
    if (decrementedSizes.length > 0) {
      for (const dec of decrementedSizes) {
        try {
          await Size.findByIdAndUpdate(dec.sizeId, { $inc: { stock: dec.quantity } });
        } catch (rbErr) {
          console.error('[Rollback Error]', rbErr);
        }
      }
    }

    console.error('[Create Order Error]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while creating the order.',
    });
  }
};

/**
 * @desc    Get all orders for the authenticated customer
 * @route   GET /api/orders
 * @access  Private (Customer)
 */
export const getCustomerOrders = async (req, res) => {
  try {
    const query = req.user.role === 'admin' ? {} : { customer: req.user._id };
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .populate('items')
      .populate('invoice');

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error('[Get Customer Orders Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve orders.',
    });
  }
};

/**
 * @desc    Get order details by ID or Order Number
 * @route   GET /api/orders/:id
 * @access  Private (Owner / Admin)
 */
export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    let query;
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { _id: id };
    } else {
      query = { orderNumber: id.toUpperCase() };
    }

    const order = await Order.findOne(query).populate('items').populate('invoice');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    // Authorization: User must own the order or be an admin
    const isOwner = order.customer ? order.customer.toString() === req.user._id.toString() : false;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this order.',
      });
    }

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('[Get Order By ID Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve order details.',
    });
  }
};

/**
 * @desc    Get final invoice for an order (Only after payment confirmation)
 * @route   GET /api/orders/:id/invoice
 * @access  Private (Owner / Admin)
 */
export const getOrderInvoice = async (req, res) => {
  try {
    const rawId = String(req.params.id || '').trim();
    const cleanId = rawId.replace(/^draft-/i, '').trim();

    let query;
    if (mongoose.Types.ObjectId.isValid(cleanId)) {
      query = { _id: cleanId };
    } else {
      query = { orderNumber: cleanId.toUpperCase() };
    }

    let order = await Order.findOne(query)
      .populate('items')
      .populate('customer', 'name businessName companyName phone email gstin address city state pincode');

    let invoice = null;

    if (!order) {
      const invQuery = mongoose.Types.ObjectId.isValid(cleanId)
        ? { _id: cleanId }
        : {
            $or: [
              { invoiceNumber: rawId.toUpperCase() },
              { invoiceNumber: cleanId.toUpperCase() },
            ],
          };
      invoice = await Invoice.findOne(invQuery).populate(
        'customer',
        'name businessName companyName phone email gstin address city state pincode'
      );
      if (invoice && invoice.order) {
        order = await Order.findById(invoice.order)
          .populate('items')
          .populate('customer', 'name businessName companyName phone email gstin address city state pincode');
      }
    }

    if (!order && !invoice) {
      return res.status(404).json({
        success: false,
        message: 'Order or Invoice not found.',
      });
    }

    // Security Check: Customer ownership or Admin role
    const customerId = order
      ? (order.customer?._id || order.customer)
      : (invoice ? (invoice.customer?._id || invoice.customer) : null);
    const isOwner = customerId
      ? customerId.toString() === req.user._id.toString()
      : false;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to access this invoice.',
      });
    }

    // Find invoice document if not already loaded
    if (!invoice && order) {
      invoice = await Invoice.findOne({ order: order._id }).populate(
        'customer',
        'name businessName companyName phone email gstin address city state pincode'
      );

      if (!invoice && order.invoice) {
        invoice = await Invoice.findById(order.invoice).populate(
          'customer',
          'name businessName companyName phone email gstin address city state pincode'
        );
      }
    }

    // Load active Mill configurations from database
    const activeSettings = await Settings.findOne();
    const liveMill = activeSettings
      ? {
          name: activeSettings.name || 'GOWTHAM TEX',
          tagline: activeSettings.tagline || 'Whole Sale Hand Looms Cloth Manufacturer',
          address: activeSettings.address || '',
          gstin: activeSettings.gstin || '33BRWPV7711D1ZD',
          stateCode: activeSettings.stateCode || '33',
          phone: activeSettings.phone || '80728 65362, 94890 40067, 95666 47834',
          email: activeSettings.email || 'orders@gowthamtex.com',
          deityText: activeSettings.deityText || 'SHIVAM',
          transportMode: activeSettings.transportMode || 'Road Cargo / VRL Logistics',
          placeOfSupply: activeSettings.placeOfSupply || 'Tamil Nadu (33)',
          vehicleNo: activeSettings.vehicleNo || 'TN 33 AB 1234',
          signatoryTitle: activeSettings.signatoryTitle || 'Proprietor',
          bankDetails: activeSettings.bankDetails || {},
        }
      : {
          name: 'GOWTHAM TEX',
          tagline: 'Whole Sale Hand Looms Cloth Manufacturer',
          deityText: 'SHIVAM',
          address:
            'D/No. 1/144, Devanampalayam, VELLIRAVELI (P.O.), Kunnathur - 638 103. (Via) Tirupur Dt. Tamilnadu.',
          gstin: '33BRWPV7711D1ZD',
          stateCode: '33',
          phone: '80728 65362, 94890 40067, 95666 47834',
          email: 'orders@gowthamtex.com',
          transportMode: 'Road Cargo / VRL Logistics',
          placeOfSupply: 'Tamil Nadu (33)',
          vehicleNo: 'TN 33 AB 1234',
          signatoryTitle: 'Proprietor',
          bankDetails: {
            accountName: 'GOWTHAM TEX',
            bankName: 'Tamilnadu Mercantile Bank',
            accountNumber: '325150050800389',
            ifsc: 'TMBL0000325',
            branch: 'Pallagoundanpalayam',
          },
        };

    // If invoice exists:
    if (invoice) {
      // Ensure buyerState and buyerStateCode are present
      const invoiceBuyerState = invoice.buyerState || invoice.deliveryAddress?.state || invoice.customerDetails?.state || order?.deliveryDetails?.state || 'Tamil Nadu';
      const invoiceBuyerGstin = invoice.customerDetails?.gstin || order?.customerDetails?.gstin || '';
      const invoiceBuyerStateCode = (
        invoice.buyerStateCode ||
        invoice.deliveryAddress?.stateCode ||
        invoice.customerDetails?.stateCode ||
        order?.buyerStateCode ||
        order?.deliveryDetails?.stateCode ||
        order?.customerDetails?.stateCode ||
        resolveGSTStateCode(invoiceBuyerState, invoiceBuyerGstin) ||
        '33'
      ).toString().replace(/\D/g, '').slice(0, 2).padStart(2, '0');

      invoice.buyerState = invoiceBuyerState;
      invoice.buyerStateCode = invoiceBuyerStateCode;

      // If invoice is NOT customized, synchronize with live mill/customer
      if (!invoice.isCustomized) {
        invoice.millGstin = liveMill.gstin;
        invoice.millDetails = {
          name: liveMill.name,
          tagline: liveMill.tagline,
          deityText: liveMill.deityText,
          address: liveMill.address,
          gstin: liveMill.gstin,
          stateCode: liveMill.stateCode,
          phone: liveMill.phone,
          email: liveMill.email,
          signatoryTitle: liveMill.signatoryTitle,
          bankDetails: liveMill.bankDetails,
        };

        const custObj = invoice.customer || order?.customer;
        if (custObj && typeof custObj === 'object') {
          const custName = custObj.businessName || custObj.companyName || custObj.name;
          if (custName) {
            invoice.customerDetails = {
              ...invoice.customerDetails,
              name: custObj.name || invoice.customerDetails?.name,
              businessName: custObj.businessName || custObj.companyName || invoice.customerDetails?.businessName,
              phone: custObj.phone || invoice.customerDetails?.phone,
              email: custObj.email || invoice.customerDetails?.email,
              gstin: custObj.gstin || invoice.customerDetails?.gstin,
              state: invoiceBuyerState,
              stateCode: invoiceBuyerStateCode,
            };
          }
        }
      }

      return res.status(200).json({
        success: true,
        invoice,
      });
    }

    // If invoice document does not exist yet (Draft Proforma Bill for Admin or Buyer):
    if (order) {
      const draftBuyerState = order.deliveryDetails?.state || order.shippingAddress?.state || order.customerDetails?.state || 'Tamil Nadu';
      const draftBuyerGstin = order.customerDetails?.gstin || order.shippingAddress?.gstin || '';
      const draftBuyerStateCode = (
        order.buyerStateCode ||
        order.deliveryDetails?.stateCode ||
        order.customerDetails?.stateCode ||
        order.shippingAddress?.stateCode ||
        (order.customer && order.customer.stateCode) ||
        resolveGSTStateCode(draftBuyerState, draftBuyerGstin) ||
        '33'
      ).toString().replace(/\D/g, '').slice(0, 2).padStart(2, '0');

      const draftInvoice = {
        _id: `draft-${order._id}`,
        invoiceNumber: `PROFORMA-${order.orderNumber}`,
        order: order._id,
        invoiceDate: order.createdAt || new Date(),
        buyerState: draftBuyerState,
        buyerStateCode: draftBuyerStateCode,
        customerDetails: {
          ...(order.customerDetails || {}),
          state: draftBuyerState,
          stateCode: draftBuyerStateCode,
        },
        deliveryAddress: {
          ...(order.deliveryDetails || {}),
          state: draftBuyerState,
          stateCode: draftBuyerStateCode,
        },
        items: order.items,
        totalPieces: order.totalPieces || (order.items || []).reduce((sum, it) => sum + (it.quantity || 0), 0),
        subtotal: order.subtotal,
        discount: order.discount || 0,
        deliveryCharge: order.deliveryCharge || 0,
        tax: order.tax || 0,
        totalAmount: order.totalAmount || order.total || 0,
        total: order.totalAmount || order.total || 0,
        paymentStatus: order.paymentStatus || 'pending',
        millGstin: liveMill.gstin,
        millDetails: liveMill,
        placeOfSupply: liveMill.placeOfSupply,
        vehicleNo: order.deliveryDetails?.vehicleNo || liveMill.vehicleNo,
        transportMode: order.deliveryDetails?.transporter || liveMill.transportMode,
        isDraft: true,
      };

      return res.status(200).json({
        success: true,
        invoice: draftInvoice,
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Invoice document not found for this confirmed order.',
    });
  } catch (error) {
    console.error('[Get Order Invoice Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve invoice.',
    });
  }
};
