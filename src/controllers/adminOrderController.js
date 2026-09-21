import mongoose from 'mongoose';
import { Order, OrderItem, Invoice, User, Settings } from '../models/index.js';
import { resolveGSTStateCode } from '../utils/gstUtils.js';

/**
 * Generate a unique invoice number (e.g. GTX-INV-10001)
 */
const generateInvoiceNumber = async () => {
  let isUnique = false;
  let invoiceNumber = '';

  while (!isUnique) {
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    invoiceNumber = `GTX-INV-${randomNum}`;
    const existing = await Invoice.findOne({ invoiceNumber });
    if (!existing) {
      isUnique = true;
    }
  }

  return invoiceNumber;
};

/**
 * @desc    Get all wholesale orders (Admin only)
 * @route   GET /api/admin/orders
 * @access  Private (Admin)
 */
export const getAllOrders = async (req, res) => {
  try {
    const { status, paymentStatus, invoiceStatus, search } = req.query;

    const filter = {};
    if (status && status !== 'ALL') {
      filter.orderStatus = status;
    }
    if (paymentStatus && paymentStatus !== 'ALL') {
      filter.paymentStatus = paymentStatus;
    }
    if (invoiceStatus && invoiceStatus !== 'ALL') {
      filter.invoiceStatus = invoiceStatus;
    }

    if (search && search.trim()) {
      const s = search.trim();
      const regex = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { orderNumber: regex },
        { 'customerDetails.name': regex },
        { 'customerDetails.businessName': regex },
        { 'customerDetails.phone': regex },
        { 'customerDetails.email': regex },
        { 'shippingAddress.name': regex },
        { 'shippingAddress.phone': regex },
      ];
    }

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .populate('customer', 'name email phone companyName gstin')
      .populate('items')
      .populate('invoice');

    // Live MongoDB aggregation of order statistics
    const allOrders = await Order.find({}, 'orderStatus paymentStatus invoiceStatus');
    const stats = {
      totalOrders: allOrders.length,
      newOrders: allOrders.filter(o => (o.orderStatus || '').toLowerCase() === 'new').length,
      pendingPayments: allOrders.filter(o => (o.paymentStatus || '').toLowerCase() === 'pending').length,
      paidOrders: allOrders.filter(o => (o.paymentStatus || '').toLowerCase() === 'paid').length,
      processingOrders: allOrders.filter(o => ['processing', 'confirmed'].includes((o.orderStatus || '').toLowerCase())).length,
      readyForDispatchOrders: allOrders.filter(o => (o.orderStatus || '').toLowerCase() === 'ready_for_dispatch').length,
      dispatchedOrders: allOrders.filter(o => (o.orderStatus || '').toLowerCase() === 'dispatched').length,
      deliveredOrders: allOrders.filter(o => (o.orderStatus || '').toLowerCase() === 'delivered').length,
      cancelledOrders: allOrders.filter(o => (o.orderStatus || '').toLowerCase() === 'cancelled').length,
    };

    return res.status(200).json({
      success: true,
      count: orders.length,
      stats,
      orders,
    });
  } catch (error) {
    console.error('[Admin Get All Orders Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve wholesale orders.',
    });
  }
};

/**
 * @desc    Get specific order details for admin
 * @route   GET /api/admin/orders/:id
 * @access  Private (Admin)
 */
export const getAdminOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    let query;
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { _id: id };
    } else {
      query = { orderNumber: id.toUpperCase() };
    }

    const order = await Order.findOne(query)
      .populate('customer', 'name email phone companyName gstin')
      .populate('items')
      .populate('invoice');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('[Admin Get Order By ID Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve order details.',
    });
  }
};

/**
 * @desc    Update order status
 * @route   PATCH /api/admin/orders/:id/status
 * @access  Private (Admin)
 */
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, lrNumber, transporter } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Order status is required.',
      });
    }

    const validStatuses = [
      'new',
      'confirmed',
      'processing',
      'ready_for_dispatch',
      'dispatched',
      'delivered',
      'cancelled',
      'NEW',
      'CONFIRMED',
      'PROCESSING',
      'READY_FOR_DISPATCH',
      'DISPATCHED',
      'DELIVERED',
      'CANCELLED',
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid order status "${status}". Allowed values: new, confirmed, processing, ready_for_dispatch, dispatched, delivered, cancelled.`,
      });
    }

    let query;
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { _id: id };
    } else {
      query = { orderNumber: id.toUpperCase() };
    }

    const order = await Order.findOne(query);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    order.orderStatus = status;

    if (transporter && order.deliveryDetails) {
      order.deliveryDetails.transporter = transporter;
    }

    await order.save();

    const populated = await Order.findById(order._id)
      .populate('customer', 'name email phone')
      .populate('items')
      .populate('invoice');

    return res.status(200).json({
      success: true,
      message: `Order status updated to "${status}" successfully.`,
      order: populated,
    });
  } catch (error) {
    console.error('[Admin Update Order Status Error]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update order status.',
    });
  }
};

/**
 * @desc    Confirm manual payment received and generate FINAL INVOICE
 * @route   PATCH /api/admin/orders/:id/payment
 * @access  Private (Admin)
 */
export const confirmOrderPayment = async (req, res) => {
  try {
    const rawId = String(req.params.id || '').trim();
    const cleanId = rawId.replace(/^draft-/i, '').trim();
    const { paymentMethod = 'UPI', paymentReference = '', amount, orderNumber: bodyOrderNumber } = req.body;

    let order = null;

    // 1. Try finding Order by valid ObjectId
    if (mongoose.Types.ObjectId.isValid(cleanId)) {
      order = await Order.findById(cleanId).populate('items').populate('customer');
    }

    // 2. Try finding by orderNumber variants
    if (!order) {
      const candidates = [
        cleanId.toUpperCase(),
        rawId.toUpperCase(),
        bodyOrderNumber ? String(bodyOrderNumber).toUpperCase().trim() : null,
      ].filter(Boolean);

      order = await Order.findOne({
        $or: [
          { orderNumber: { $in: candidates } },
          { _id: mongoose.Types.ObjectId.isValid(cleanId) ? cleanId : null },
        ],
      }).populate('items').populate('customer');
    }

    // 3. Try finding via Invoice document
    if (!order) {
      const invQuery = mongoose.Types.ObjectId.isValid(cleanId)
        ? { _id: cleanId }
        : {
            $or: [
              { invoiceNumber: rawId.toUpperCase() },
              { invoiceNumber: cleanId.toUpperCase() },
              { invoiceNumber: `GTX-INV-${cleanId.replace(/\D/g, '')}` },
            ],
          };
      const inv = await Invoice.findOne(invQuery);
      if (inv && inv.order) {
        order = await Order.findById(inv.order).populate('items').populate('customer');
      }
    }

    // 4. Try finding by matching numeric digits of order number
    if (!order) {
      const digits = cleanId.replace(/\D/g, '');
      if (digits && digits.length >= 4) {
        order = await Order.findOne({
          orderNumber: new RegExp(digits, 'i'),
        }).populate('items').populate('customer');
      }
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    // Check if already confirmed
    if (order.paymentStatus === 'paid' && order.invoice) {
      const existingInvoice = await Invoice.findById(order.invoice);
      return res.status(200).json({
        success: true,
        message: 'Payment was already confirmed for this order.',
        order,
        invoice: existingInvoice,
      });
    }

    // Check if an invoice document already exists (e.g. customized by admin or pre-created)
    let invoice = null;
    if (order.invoice) {
      invoice = await Invoice.findById(order.invoice);
    }
    if (!invoice) {
      invoice = await Invoice.findOne({ order: order._id });
    }

    if (invoice) {
      // PRESERVE existing customized invoice details!
      invoice.paymentMethod = paymentMethod;
      invoice.paymentStatus = 'paid';
      invoice.paymentReference = paymentReference.trim();
      invoice.paymentConfirmedAt = new Date();
      if (
        !invoice.invoiceNumber ||
        invoice.invoiceNumber.startsWith('DRAFT-') ||
        invoice.invoiceNumber.startsWith('GTX-INV-draft-')
      ) {
        invoice.invoiceNumber = await generateInvoiceNumber();
      }
      await invoice.save();
    } else {
      // 1. Generate unique invoice number
      const invoiceNumber = await generateInvoiceNumber();

      // 2. Prepare items snapshot for invoice
      const invoiceItems = (order.items || []).map((item) => ({
        product: item.product?._id || item.product,
        productName: item.productName || 'White Towel',
        hsnCode: item.hsnCode || item.product?.hsnCode || '6302.60',
        size: item.size || 'Standard',
        sizeRef: item.sizeRef,
        quantity: item.quantity || 0,
        price: item.price || 0,
        subtotal: item.subtotal || 0,
      }));

      // 3. Create Final Invoice document with live Mill snapshot
      const customerId = order.customer?._id || order.customer || req.user._id;

      const activeSettings = await Settings.findOne();
      const millDetails = activeSettings ? {
        name: activeSettings.name || 'GOWTHAM TEX',
        tagline: activeSettings.tagline || 'Whole Sale Hand Looms Cloth Manufacturer',
        address: activeSettings.address || '',
        gstin: activeSettings.gstin || '33BRWPV7711D1ZD',
        stateCode: activeSettings.stateCode || '33',
        phone: activeSettings.phone || '80728 65362, 94890 40067, 95666 47834',
        email: activeSettings.email || 'orders@gowthamtex.com',
        bankDetails: activeSettings.bankDetails || {},
      } : {
        name: 'GOWTHAM TEX',
        tagline: 'Whole Sale Hand Looms Cloth Manufacturer',
        address: 'D/No. 1/144, Devanampalayam, VELLIRAVELI (P.O.), Kunnathur - 638 103. (Via) Tirupur Dt. Tamilnadu.',
        gstin: '33BRWPV7711D1ZD',
        stateCode: '33',
        phone: '80728 65362, 94890 40067, 95666 47834',
        email: 'orders@gowthamtex.com',
        bankDetails: {
          accountName: 'GOWTHAM TEX',
          bankName: 'Tamilnadu Mercantile Bank',
          accountNumber: '325150050800389',
          ifsc: 'TMBL0000325',
          branch: 'Pallagoundanpalayam',
        },
      };

      const buyerState = order.deliveryDetails?.state || order.shippingAddress?.state || order.customerDetails?.state || 'Tamil Nadu';
      const buyerGstin = order.customerDetails?.gstin || order.shippingAddress?.gstin || '';
      const buyerStateCode = (
        order.buyerStateCode ||
        order.deliveryDetails?.stateCode ||
        order.customerDetails?.stateCode ||
        order.shippingAddress?.stateCode ||
        (order.customer && order.customer.stateCode) ||
        resolveGSTStateCode(buyerState, buyerGstin) ||
        '33'
      ).toString().replace(/\D/g, '').slice(0, 2).padStart(2, '0');

      invoice = new Invoice({
        invoiceNumber,
        order: order._id,
        customer: customerId,
        buyerState,
        buyerStateCode,
        customerDetails: {
          name: order.customerDetails?.name || order.shippingAddress?.name || 'Customer',
          businessName: order.customerDetails?.businessName || '',
          phone: order.customerDetails?.phone || order.shippingAddress?.phone || '',
          email: order.customerDetails?.email || '',
          gstin: buyerGstin,
          state: buyerState,
          stateCode: buyerStateCode,
        },
        deliveryAddress: {
          addressLine1: order.deliveryDetails?.addressLine1 || order.shippingAddress?.address || '',
          addressLine2: order.deliveryDetails?.addressLine2 || '',
          city: order.deliveryDetails?.city || order.shippingAddress?.city || '',
          state: buyerState,
          stateCode: buyerStateCode,
          pincode: order.deliveryDetails?.pincode || order.shippingAddress?.pincode || '',
          contactPhone: order.deliveryDetails?.contactPhone || order.shippingAddress?.phone || '',
          transporter: order.deliveryDetails?.transporter || 'VRL Logistics Cargo',
        },
        items: invoiceItems,
        totalPieces: order.totalPieces || invoiceItems.reduce((sum, it) => sum + Number(it.quantity || 0), 0),
        subtotal: order.subtotal,
        discount: order.discount || 0,
        deliveryCharge: order.deliveryCharge || 0,
        tax: order.tax || 0,
        totalAmount: order.totalAmount,
        total: order.totalAmount,
        paymentMethod,
        paymentStatus: 'paid',
        paymentReference: paymentReference.trim(),
        paymentConfirmedAt: new Date(),
        hsnCode: activeSettings?.hsnCode || '6302.60',
        millGstin: millDetails.gstin || '33BRWPV7711D1ZD',
        placeOfSupply: activeSettings?.placeOfSupply || 'Tamil Nadu (33)',
        vehicleNo: order.deliveryDetails?.vehicleNo || activeSettings?.vehicleNo || 'TN 33 AB 1234',
        transportMode: order.deliveryDetails?.transporter || activeSettings?.transportMode || 'Road Cargo / VRL Logistics',
        ewbNo: order.deliveryDetails?.lrNumber ? `EWB-${order.deliveryDetails.lrNumber}` : `GTX-EWB-${order.orderNumber}`,
        signatoryTitle: activeSettings?.signatoryTitle || 'Proprietor',
        millDetails,
      });

      await invoice.save();
    }

    // 4. Update Order record
    order.paymentStatus = 'paid';
    order.invoiceStatus = 'generated';
    order.invoice = invoice._id;
    order.invoiceNumber = invoice.invoiceNumber;
    order.paymentMethod = paymentMethod;

    // Transition status to confirmed if it was new
    if (order.orderStatus === 'new' || order.orderStatus === 'PENDING') {
      order.orderStatus = 'confirmed';
    }

    order.paymentDetails = {
      confirmedAt: new Date(),
      confirmedBy: req.user._id,
      paymentMethod,
      paymentReference: paymentReference.trim(),
      amountConfirmed: Number(amount) || order.totalAmount,
    };

    await order.save();

    const updatedOrder = await Order.findById(order._id)
      .populate('customer', 'name email phone')
      .populate('items')
      .populate('invoice');

    return res.status(200).json({
      success: true,
      message: `Payment of ₹${order.totalAmount.toLocaleString('en-IN')} confirmed. Final invoice ${invoice.invoiceNumber} generated.`,
      order: updatedOrder,
      invoice,
    });
  } catch (error) {
    console.error('[Admin Confirm Order Payment Error]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to confirm payment and generate invoice.',
    });
  }
};

/**
 * @desc    Get all generated invoices (Admin only)
 * @route   GET /api/admin/invoices
 * @access  Private (Admin)
 */
export const getAllInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find()
      .sort({ createdAt: -1 })
      .populate('customer', 'name email phone')
      .populate('order');

    return res.status(200).json({
      success: true,
      count: invoices.length,
      invoices,
    });
  } catch (error) {
    console.error('[Admin Get All Invoices Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve invoices.',
    });
  }
};

/**
 * @desc    Get all wholesale buyers with strict deduplication & trade volume metrics (Admin only)
 * @route   GET /api/admin/customers
 * @access  Private (Admin)
 */
export const getAdminCustomers = async (req, res) => {
  try {
    const { search } = req.query;

    const normalizePhoneDigits = (ph) => {
      if (!ph) return '';
      let digits = String(ph).replace(/\D/g, '');
      if (digits.length === 12 && digits.startsWith('91')) {
        digits = digits.slice(2);
      } else if (digits.length === 11 && digits.startsWith('0')) {
        digits = digits.slice(1);
      }
      return digits;
    };

    // 1. Fetch registered customer users
    const users = await User.find({ role: { $ne: 'admin' } }).sort({ createdAt: -1 }).lean();

    // 2. Fetch all orders with customer details
    const orders = await Order.find().sort({ createdAt: -1 }).lean();

    // 3. Compute statistics per customer
    const statsByCustomer = new Map();

    for (const order of orders) {
      const custId = order.customer ? order.customer.toString() : null;
      const custEmail = (order.customerDetails?.email || '').toLowerCase().trim();
      const rawPhone = order.customerDetails?.phone || order.shippingAddress?.phone || '';
      const custPhone = normalizePhoneDigits(rawPhone);
      const custGstin = (order.customerDetails?.gstin || order.shippingAddress?.gstin || '').toUpperCase().trim();
      const orderAmount = Number(order.totalAmount || order.total || 0);

      const keys = [];
      if (custId) keys.push(`id:${custId}`);
      if (custEmail) keys.push(`email:${custEmail}`);
      if (custPhone) keys.push(`phone:${custPhone}`);
      if (custGstin && custGstin.length >= 10) keys.push(`gstin:${custGstin}`);

      for (const key of keys) {
        if (!statsByCustomer.has(key)) {
          statsByCustomer.set(key, {
            totalOrdersCount: 0,
            lifetimeVolumeNum: 0,
            lastOrderDate: order.createdAt,
          });
        }
        const st = statsByCustomer.get(key);
        st.totalOrdersCount += 1;
        st.lifetimeVolumeNum += orderAmount;
        if (new Date(order.createdAt) > new Date(st.lastOrderDate)) {
          st.lastOrderDate = order.createdAt;
        }
      }
    }

    // 4. Merge and deduplicate customer profiles
    const deduplicatedBuyers = [];
    const seenEmails = new Set();
    const seenPhones = new Set();
    const seenGstins = new Set();
    const seenNames = new Set();
    const seenIds = new Set();

    const addOrMergeBuyer = (candidate) => {
      const normEmail = (candidate.email || '').toLowerCase().trim();
      const normPhone = normalizePhoneDigits(candidate.phone);
      const normGstin = (candidate.gstin || '').toUpperCase().trim();
      const normName = (candidate.name || candidate.businessName || '').toLowerCase().trim();
      const candId = candidate.id || candidate._id ? String(candidate.id || candidate._id) : '';

      // Check if candidate matches any previously seen buyer
      let existingIndex = -1;
      if (candId && seenIds.has(candId)) {
        existingIndex = deduplicatedBuyers.findIndex((b) => b.id === candId || b._id === candId);
      }
      if (existingIndex === -1 && normEmail && normEmail !== 'n/a' && seenEmails.has(normEmail)) {
        existingIndex = deduplicatedBuyers.findIndex((b) => (b.email || '').toLowerCase().trim() === normEmail);
      }
      if (existingIndex === -1 && normPhone && normPhone.length >= 10 && seenPhones.has(normPhone)) {
        existingIndex = deduplicatedBuyers.findIndex((b) => normalizePhoneDigits(b.phone) === normPhone);
      }
      if (existingIndex === -1 && normGstin && normGstin !== 'UNREGISTERED' && normGstin.length >= 15 && seenGstins.has(normGstin)) {
        existingIndex = deduplicatedBuyers.findIndex((b) => (b.gstin || '').toUpperCase().trim() === normGstin);
      }
      if (existingIndex === -1 && normName && normName.length > 3 && seenNames.has(normName)) {
        existingIndex = deduplicatedBuyers.findIndex((b) => (b.name || '').toLowerCase().trim() === normName);
      }

      const idKey = candId ? `id:${candId}` : '';
      const emailKey = normEmail ? `email:${normEmail}` : '';
      const phoneKey = normPhone ? `phone:${normPhone}` : '';
      const gstinKey = normGstin ? `gstin:${normGstin}` : '';

      const stat =
        (idKey && statsByCustomer.get(idKey)) ||
        (emailKey && statsByCustomer.get(emailKey)) ||
        (phoneKey && statsByCustomer.get(phoneKey)) ||
        (gstinKey && statsByCustomer.get(gstinKey)) || {
          totalOrdersCount: candidate.totalOrdersCount || 0,
          lifetimeVolumeNum: candidate.lifetimeVolumeNum || 0,
          lastOrderDate: candidate.lastOrderDate || null,
        };

      if (existingIndex > -1) {
        // Merge with existing record
        const existing = deduplicatedBuyers[existingIndex];
        existing.totalOrdersCount = Math.max(existing.totalOrdersCount, stat.totalOrdersCount);
        existing.lifetimeVolumeNum = Math.max(existing.lifetimeVolumeNum, stat.lifetimeVolumeNum);
        existing.lifetimeVolume = `₹${existing.lifetimeVolumeNum.toLocaleString('en-IN')}`;
        if (!existing.phone || existing.phone === 'N/A') existing.phone = candidate.phone;
        if (!existing.email || existing.email === 'N/A') existing.email = candidate.email;
        if (!existing.gstin || existing.gstin === 'Unregistered') existing.gstin = candidate.gstin;
        if (!existing.address) existing.address = candidate.address;
        if (!existing.city) existing.city = candidate.city;
        if (!existing.state) existing.state = candidate.state;
        if (!existing.pincode) existing.pincode = candidate.pincode;
        return;
      }

      // Create new unique buyer record
      const buyer = {
        id: candId || `cust-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        _id: candId || `cust-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: candidate.businessName || candidate.companyName || candidate.name || 'Wholesale Buyer',
        contactPerson: candidate.name || candidate.contactPerson || 'Primary Contact',
        phone: candidate.phone || 'N/A',
        email: candidate.email || 'N/A',
        gstin: candidate.gstin || 'Unregistered',
        pan: candidate.gstin && candidate.gstin.length >= 12 ? candidate.gstin.substring(2, 12) : (candidate.pan || 'N/A'),
        address: candidate.address || '',
        city: candidate.city || 'Erode',
        state: candidate.state || 'Tamil Nadu',
        pincode: candidate.pincode || '638001',
        creditStatus:
          stat.totalOrdersCount >= 5
            ? 'Tier 1 Active'
            : stat.totalOrdersCount > 0
            ? 'Active Buyer'
            : 'Registered MSME',
        totalOrdersCount: stat.totalOrdersCount,
        lifetimeVolume: `₹${stat.lifetimeVolumeNum.toLocaleString('en-IN')}`,
        lifetimeVolumeNum: stat.lifetimeVolumeNum,
        lastOrderDate: stat.lastOrderDate,
        createdAt: candidate.createdAt || new Date(),
      };

      deduplicatedBuyers.push(buyer);
      if (candId) seenIds.add(candId);
      if (normEmail && normEmail !== 'n/a') seenEmails.add(normEmail);
      if (normPhone && normPhone.length >= 10) seenPhones.add(normPhone);
      if (normGstin && normGstin !== 'UNREGISTERED' && normGstin.length >= 15) seenGstins.add(normGstin);
      if (normName && normName.length > 3) seenNames.add(normName);
    };

    // Process all users
    for (const user of users) {
      addOrMergeBuyer({
        ...user,
        id: user._id.toString(),
        _id: user._id.toString(),
        businessName: user.businessName || user.companyName,
      });
    }

    // Process all orders for any guest or unlinked buyers
    for (const order of orders) {
      if (order.customerDetails) {
        addOrMergeBuyer({
          id: order.customer ? order.customer.toString() : '',
          _id: order.customer ? order.customer.toString() : '',
          name: order.customerDetails.name,
          businessName: order.customerDetails.businessName || order.customerDetails.name,
          contactPerson: order.customerDetails.name,
          phone: order.customerDetails.phone,
          email: order.customerDetails.email,
          gstin: order.customerDetails.gstin,
          address: order.deliveryDetails?.addressLine1 || order.shippingAddress?.address,
          city: order.deliveryDetails?.city || order.shippingAddress?.city,
          state: order.deliveryDetails?.state || order.shippingAddress?.state,
          pincode: order.deliveryDetails?.pincode || order.shippingAddress?.pincode,
          createdAt: order.createdAt,
        });
      }
    }

    let customerList = [...deduplicatedBuyers];

    // 5. Apply search filter if query provided
    if (search && search.trim()) {
      const term = search.toLowerCase().trim();
      customerList = customerList.filter((c) =>
        (c.name || '').toLowerCase().includes(term) ||
        (c.contactPerson || '').toLowerCase().includes(term) ||
        (c.email || '').toLowerCase().includes(term) ||
        (c.phone || '').includes(term) ||
        (c.gstin || '').toLowerCase().includes(term) ||
        (c.city || '').toLowerCase().includes(term)
      );
    }

    // Sort by total orders descending, then newest
    customerList.sort(
      (a, b) => b.totalOrdersCount - a.totalOrdersCount || new Date(b.createdAt) - new Date(a.createdAt)
    );

    return res.status(200).json({
      success: true,
      count: customerList.length,
      customers: customerList,
    });
  } catch (error) {
    console.error('[Admin Get Customers Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve wholesale buyers.',
    });
  }
};

/**
 * @desc    Update wholesale buyer profile details (Admin only)
 * @route   PUT /api/admin/customers/:id
 * @access  Private (Admin)
 */
export const updateAdminCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, businessName, phone, email, gstin, pan, address, city, state, pincode } = req.body;

    let user = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      user = await User.findById(id);
    } else {
      user = await User.findOne({ email: id.toLowerCase() });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Customer user record not found.',
      });
    }

    if (name !== undefined) user.name = name.trim();
    if (businessName !== undefined) {
      user.businessName = businessName.trim();
      user.companyName = businessName.trim();
    }
    if (phone !== undefined) user.phone = phone.trim();
    if (email !== undefined) user.email = email.trim().toLowerCase();
    if (gstin !== undefined) user.gstin = gstin.trim().toUpperCase();
    if (pan !== undefined) user.pan = pan.trim().toUpperCase();
    if (address !== undefined) user.address = address.trim();
    if (city !== undefined) user.city = city.trim();
    if (state !== undefined) user.state = state.trim();
    if (pincode !== undefined) user.pincode = pincode.trim();

    await user.save();

    // Synchronize customer's open orders and non-customized invoices with updated profile
    try {
      const customerDisplayName = user.businessName || user.companyName || user.name || 'Customer';
      const customerOrders = await Order.find({ customer: user._id });
      const orderIds = customerOrders.map((o) => o._id);

      await Order.updateMany(
        { customer: user._id },
        {
          $set: {
            'customerDetails.name': user.name,
            'customerDetails.businessName': user.businessName || user.companyName || '',
            'customerDetails.phone': user.phone,
            'customerDetails.email': user.email,
            'customerDetails.gstin': user.gstin || '',
            'shippingAddress.name': customerDisplayName,
            'shippingAddress.phone': user.phone,
            'shippingAddress.address': user.address || '',
            'shippingAddress.city': user.city || '',
            'shippingAddress.state': user.state || '',
            'shippingAddress.pincode': user.pincode || '',
            'shippingAddress.gstin': user.gstin || '',
          },
        }
      );

      await Invoice.updateMany(
        {
          $or: [{ customer: user._id }, { order: { $in: orderIds } }],
          isCustomized: { $ne: true },
        },
        {
          $set: {
            'customerDetails.name': user.name,
            'customerDetails.businessName': user.businessName || user.companyName || '',
            'customerDetails.phone': user.phone,
            'customerDetails.email': user.email,
            'customerDetails.gstin': user.gstin || '',
          },
        }
      );
    } catch (syncErr) {
      console.warn('[Admin Update Customer] Sync error on orders/invoices:', syncErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Buyer account details updated successfully.',
      customer: user,
    });
  } catch (error) {
    console.error('[Admin Update Customer Error]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update buyer profile.',
    });
  }
};

/**
 * @desc    Update invoice / bill details (Admin only)
 * @route   PUT /api/admin/invoices/:id or PUT /api/admin/orders/:id/invoice
 * @access  Private (Admin)
 */
export const updateInvoice = async (req, res) => {
  try {
    const rawId = String(req.params.id || '').trim();
    const cleanId = rawId.replace(/^draft-/i, '').trim();
    const body = req.body || {};

    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can customize or edit bills.',
      });
    }

    let invoice = null;
    let order = null;

    // Resolve Invoice or Order by ID or orderNumber/invoiceNumber
    if (mongoose.Types.ObjectId.isValid(cleanId)) {
      invoice = await Invoice.findById(cleanId);
      if (!invoice) {
        order = await Order.findById(cleanId).populate('items').populate('customer');
        if (order && order.invoice) {
          invoice = await Invoice.findById(order.invoice);
        }
      }
    } else {
      const upperRaw = rawId.toUpperCase();
      const upperClean = cleanId.toUpperCase();
      invoice = await Invoice.findOne({
        $or: [{ invoiceNumber: upperRaw }, { invoiceNumber: upperClean }],
      });
      if (!invoice) {
        order = await Order.findOne({
          $or: [{ orderNumber: upperRaw }, { orderNumber: upperClean }],
        }).populate('items').populate('customer');
        if (order && order.invoice) {
          invoice = await Invoice.findById(order.invoice);
        }
      }
    }

    if (!order && invoice && invoice.order) {
      order = await Order.findById(invoice.order).populate('items').populate('customer');
    }

    // If invoice does not exist yet (e.g. editing a draft bill before payment confirmation)
    if (!invoice && order) {
      const activeSettings = await Settings.findOne();
      const initialBuyerState = order.deliveryDetails?.state || order.shippingAddress?.state || order.customerDetails?.state || 'Tamil Nadu';
      const initialBuyerGstin = order.customerDetails?.gstin || order.shippingAddress?.gstin || '';
      const initialBuyerStateCode = (
        order.buyerStateCode ||
        order.deliveryDetails?.stateCode ||
        order.customerDetails?.stateCode ||
        order.shippingAddress?.stateCode ||
        resolveGSTStateCode(initialBuyerState, initialBuyerGstin) ||
        '33'
      ).toString().replace(/\D/g, '').slice(0, 2).padStart(2, '0');

      invoice = new Invoice({
        invoiceNumber: body.invoiceNumber || `GTX-INV-${order.orderNumber || order._id.toString().slice(-6).toUpperCase()}`,
        order: order._id,
        customer: order.customer?._id || order.customer || req.user._id,
        buyerState: initialBuyerState,
        buyerStateCode: initialBuyerStateCode,
        customerDetails: {
          ...(order.customerDetails || {}),
          state: initialBuyerState,
          stateCode: initialBuyerStateCode,
        },
        deliveryAddress: {
          ...(order.deliveryDetails || {}),
          state: initialBuyerState,
          stateCode: initialBuyerStateCode,
        },
        items: (order.items || []).map((item) => ({
          product: item.product?._id || item.product,
          productName: item.productName || 'White Towel',
          hsnCode: item.hsnCode || '6302.60',
          size: item.size || 'Standard',
          sizeRef: item.sizeRef,
          quantity: item.quantity || 0,
          price: item.price || 0,
          subtotal: item.subtotal || 0,
        })),
        subtotal: order.subtotal || 0,
        discount: order.discount || 0,
        deliveryCharge: order.deliveryCharge || 0,
        tax: order.tax || 0,
        totalAmount: order.totalAmount || order.total || 0,
        total: order.totalAmount || order.total || 0,
        paymentStatus: order.paymentStatus || 'pending',
        millGstin: activeSettings?.gstin || '33BRWPV7711D1ZD',
        millDetails: activeSettings ? {
          name: activeSettings.name,
          tagline: activeSettings.tagline,
          deityText: activeSettings.deityText || 'SHIVAM',
          address: activeSettings.address,
          gstin: activeSettings.gstin,
          stateCode: activeSettings.stateCode,
          phone: activeSettings.phone,
          email: activeSettings.email,
          signatoryTitle: activeSettings.signatoryTitle || 'Proprietor',
          bankDetails: activeSettings.bankDetails,
        } : {},
      });
    }

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice or associated order not found.',
      });
    }

    // Ensure millDetails object exists
    if (!invoice.millDetails) {
      invoice.millDetails = {};
    }

    // Apply Mill details overrides if provided
    if (body.millName !== undefined || body.millDetails?.name !== undefined) {
      invoice.millDetails.name = (body.millName || body.millDetails?.name || '').trim();
    }
    if (body.millTagline !== undefined || body.millDetails?.tagline !== undefined) {
      invoice.millDetails.tagline = (body.millTagline || body.millDetails?.tagline || '').trim();
    }
    if (body.deityText !== undefined || body.millDetails?.deityText !== undefined) {
      invoice.millDetails.deityText = (body.deityText || body.millDetails?.deityText || 'SHIVAM').trim().toUpperCase();
    }
    if (body.millPhone !== undefined || body.millDetails?.phone !== undefined) {
      invoice.millDetails.phone = (body.millPhone || body.millDetails?.phone || '').trim();
    }
    if (body.millEmail !== undefined || body.millDetails?.email !== undefined) {
      invoice.millDetails.email = (body.millEmail || body.millDetails?.email || '').trim().toLowerCase();
    }
    if (body.millGstin !== undefined || body.millDetails?.gstin !== undefined) {
      const gstinVal = (body.millGstin || body.millDetails?.gstin || '').trim().toUpperCase();
      invoice.millGstin = gstinVal;
      invoice.millDetails.gstin = gstinVal;
    }
    if (body.millStateCode !== undefined || body.millDetails?.stateCode !== undefined) {
      invoice.millDetails.stateCode = (body.millStateCode || body.millDetails?.stateCode || '').trim();
    }
    if (body.millAddress !== undefined || body.millDetails?.address !== undefined) {
      invoice.millDetails.address = (body.millAddress || body.millDetails?.address || '').trim();
    }
    if (body.signatoryTitle !== undefined || body.millDetails?.signatoryTitle !== undefined) {
      invoice.signatoryTitle = (body.signatoryTitle || body.millDetails?.signatoryTitle || '').trim();
      invoice.millDetails.signatoryTitle = invoice.signatoryTitle;
    }

    // Bank Details
    if (
      body.bankName !== undefined ||
      body.accountNumber !== undefined ||
      body.ifsc !== undefined ||
      body.branch !== undefined ||
      body.accountName !== undefined ||
      body.millDetails?.bankDetails
    ) {
      invoice.millDetails.bankDetails = {
        bankName: (body.bankName !== undefined ? body.bankName : body.millDetails?.bankDetails?.bankName || invoice.millDetails?.bankDetails?.bankName || '').trim(),
        branch: (body.branch !== undefined ? body.branch : body.millDetails?.bankDetails?.branch || invoice.millDetails?.bankDetails?.branch || '').trim(),
        accountName: (body.accountName !== undefined ? body.accountName : body.millDetails?.bankDetails?.accountName || invoice.millDetails?.bankDetails?.accountName || '').trim(),
        accountNumber: (body.accountNumber !== undefined ? body.accountNumber : body.millDetails?.bankDetails?.accountNumber || invoice.millDetails?.bankDetails?.accountNumber || '').trim(),
        ifsc: (body.ifsc !== undefined ? body.ifsc : body.millDetails?.bankDetails?.ifsc || invoice.millDetails?.bankDetails?.ifsc || '').trim().toUpperCase(),
      };
    }

    // Logistics & Metadata
    if (body.placeOfSupply !== undefined) invoice.placeOfSupply = body.placeOfSupply.trim();
    if (body.vehicleNo !== undefined) invoice.vehicleNo = body.vehicleNo.trim().toUpperCase();
    if (body.transportMode !== undefined) invoice.transportMode = body.transportMode.trim();
    if (body.ewbNo !== undefined) invoice.ewbNo = body.ewbNo.trim().toUpperCase();
    if (body.invoiceNumber !== undefined && body.invoiceNumber.trim()) {
      invoice.invoiceNumber = body.invoiceNumber.trim().toUpperCase();
    }
    if (body.invoiceDate !== undefined || body.invoiceDateStr !== undefined) {
      if (body.invoiceDate) {
        invoice.invoiceDate = new Date(body.invoiceDate);
      } else if (body.invoiceDateStr) {
        const parts = body.invoiceDateStr.split('/');
        if (parts.length === 3) {
          invoice.invoiceDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        }
      }
    }

    // Customer & Receiver Details
    const rawProvidedState = body.buyerState !== undefined ? body.buyerState : (body.deliveryAddress?.state || body.customerDetails?.state || invoice.buyerState || invoice.deliveryAddress?.state || invoice.customerDetails?.state || '');
    const rawProvidedGstin = body.buyerGstin !== undefined ? body.buyerGstin : (body.customerDetails?.gstin || invoice.customerDetails?.gstin || '');
    const rawProvidedStateCode = (body.buyerStateCode !== undefined ? body.buyerStateCode : (body.deliveryAddress?.stateCode !== undefined ? body.deliveryAddress.stateCode : body.customerDetails?.stateCode));

    let resolvedBuyerStateCode = invoice.buyerStateCode || invoice.deliveryAddress?.stateCode || invoice.customerDetails?.stateCode || '33';
    if (rawProvidedStateCode !== undefined && String(rawProvidedStateCode).trim() !== '') {
      const cleanDigits = String(rawProvidedStateCode).replace(/\D/g, '').slice(0, 2);
      if (cleanDigits) {
        resolvedBuyerStateCode = cleanDigits.padStart(2, '0');
      }
    } else if (body.buyerState !== undefined || body.buyerGstin !== undefined) {
      resolvedBuyerStateCode = resolveGSTStateCode(rawProvidedState, rawProvidedGstin);
    }

    invoice.buyerState = (rawProvidedState || 'Tamil Nadu').trim();
    invoice.buyerStateCode = resolvedBuyerStateCode;

    if (body.customerName !== undefined || body.customerDetails?.name !== undefined || body.customerDetails?.businessName !== undefined || body.customerContact !== undefined || body.customerEmail !== undefined || body.buyerGstin !== undefined || body.buyerState !== undefined || body.buyerStateCode !== undefined) {
      invoice.customerDetails = {
        ...invoice.customerDetails,
        name: (body.customerName || body.customerDetails?.name || invoice.customerDetails?.name || '').trim(),
        businessName: (body.customerName || body.customerDetails?.businessName || invoice.customerDetails?.businessName || '').trim(),
        phone: (body.customerContact !== undefined ? body.customerContact : body.customerDetails?.phone || invoice.customerDetails?.phone || '').trim(),
        email: (body.customerEmail !== undefined ? body.customerEmail : body.customerDetails?.email || invoice.customerDetails?.email || '').trim().toLowerCase(),
        gstin: (body.buyerGstin !== undefined ? body.buyerGstin : body.customerDetails?.gstin || invoice.customerDetails?.gstin || '').trim().toUpperCase(),
        state: invoice.buyerState,
        stateCode: invoice.buyerStateCode,
      };
    }

    if (body.billingAddress !== undefined || body.deliveryAddress || body.buyerState !== undefined || body.buyerStateCode !== undefined || body.customerContact !== undefined || body.transportMode !== undefined || body.vehicleNo !== undefined) {
      const addr = body.billingAddress || body.deliveryAddress?.addressLine1 || invoice.deliveryAddress?.addressLine1 || '';
      invoice.deliveryAddress = {
        ...invoice.deliveryAddress,
        addressLine1: addr.trim(),
        state: invoice.buyerState,
        stateCode: invoice.buyerStateCode,
        contactPhone: (body.customerContact !== undefined ? body.customerContact : body.deliveryAddress?.contactPhone || invoice.deliveryAddress?.contactPhone || '').trim(),
        transporter: (body.transportMode !== undefined ? body.transportMode : body.deliveryAddress?.transporter || invoice.deliveryAddress?.transporter || '').trim(),
        vehicleNo: (body.vehicleNo !== undefined ? body.vehicleNo : body.deliveryAddress?.vehicleNo || invoice.deliveryAddress?.vehicleNo || '').trim().toUpperCase(),
      };
    }

    // Product Items, Quantities (Pieces), Rates & HSN Overrides
    if (Array.isArray(body.items) && body.items.length > 0) {
      let calculatedSubtotal = 0;
      let calculatedPieces = 0;

      invoice.items = body.items.map((item) => {
        const qty = Math.max(0, parseInt(item.quantity, 10) || 0);
        const price = Math.max(0, Number(item.price) || 0);
        const lineTotal = Number(item.subtotal) || (qty * price);

        calculatedSubtotal += lineTotal;
        calculatedPieces += qty;

        const itemObj = {
          productName: (item.productName || item.name || 'White Towel').trim(),
          hsnCode: (item.hsnCode || item.hsn || '6302.60').trim(),
          size: (item.size || '').trim(),
          quantity: qty,
          price: price,
          subtotal: lineTotal,
        };

        const prodId = item.product?._id || item.product;
        if (prodId && mongoose.Types.ObjectId.isValid(prodId)) {
          itemObj.product = prodId;
        }
        if (item.sizeRef && mongoose.Types.ObjectId.isValid(item.sizeRef)) {
          itemObj.sizeRef = item.sizeRef;
        }

        return itemObj;
      });

      invoice.totalPieces = calculatedPieces;
      invoice.subtotal = calculatedSubtotal;
      const discount = Number(invoice.discount || 0);
      const taxable = Math.max(0, calculatedSubtotal - discount);
      const tax = Number(body.tax !== undefined ? body.tax : Math.round(taxable * 0.05));
      invoice.tax = tax;
      invoice.totalAmount = taxable + tax + Number(invoice.deliveryCharge || 0);
      invoice.total = invoice.totalAmount;
    } else if (body.itemHsnOverrides && typeof body.itemHsnOverrides === 'object') {
      invoice.items = invoice.items.map((item, idx) => {
        const key = item._id ? item._id.toString() : (item.id ? item.id.toString() : `item-${idx}`);
        const customHsn = body.itemHsnOverrides[key] || body.itemHsnOverrides[item.product?.toString()] || body.itemHsnOverrides[item.sizeRef?.toString()];
        if (customHsn) {
          item.hsnCode = String(customHsn).trim();
        }
        return item;
      });
      invoice.totalPieces = invoice.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    }

    if (body.totalPieces !== undefined && Number(body.totalPieces) >= 0) {
      invoice.totalPieces = Number(body.totalPieces);
    }

    // Mark invoice as explicitly customized by Admin
    invoice.isCustomized = true;

    await invoice.save();

    // Synchronize Order document and OrderItem collection if order exists
    if (order) {
      order.invoice = invoice._id;
      order.invoiceNumber = invoice.invoiceNumber;
      if (invoice.totalPieces !== undefined) {
        order.totalPieces = invoice.totalPieces;
      }
      if (invoice.subtotal !== undefined) {
        order.subtotal = invoice.subtotal;
        order.tax = invoice.tax;
        order.totalAmount = invoice.totalAmount;
        order.total = invoice.total;
      }
      if (invoice.customerDetails) {
        order.customerDetails = {
          ...order.customerDetails,
          name: invoice.customerDetails.name,
          businessName: invoice.customerDetails.businessName,
          phone: invoice.customerDetails.phone,
          email: invoice.customerDetails.email,
          gstin: invoice.customerDetails.gstin,
          state: invoice.customerDetails.state || invoice.deliveryAddress?.state || invoice.buyerState,
          stateCode: invoice.buyerStateCode || invoice.customerDetails.stateCode,
        };
      }
      if (invoice.deliveryAddress) {
        order.deliveryDetails = {
          ...order.deliveryDetails,
          addressLine1: invoice.deliveryAddress.addressLine1,
          state: invoice.deliveryAddress.state || invoice.buyerState,
          stateCode: invoice.buyerStateCode || invoice.deliveryAddress.stateCode,
          contactPhone: invoice.deliveryAddress.contactPhone,
          transporter: invoice.deliveryAddress.transporter,
          vehicleNo: invoice.deliveryAddress.vehicleNo || invoice.vehicleNo,
        };
        order.shippingAddress = {
          ...order.shippingAddress,
          name: invoice.customerDetails?.businessName || invoice.customerDetails?.name || order.shippingAddress?.name,
          phone: invoice.customerDetails?.phone || order.shippingAddress?.phone,
          address: invoice.deliveryAddress.addressLine1 || order.shippingAddress?.address,
          state: invoice.deliveryAddress.state || invoice.buyerState || order.shippingAddress?.state,
          stateCode: invoice.buyerStateCode || invoice.deliveryAddress?.stateCode || order.shippingAddress?.stateCode,
          gstin: invoice.customerDetails?.gstin || order.shippingAddress?.gstin,
        };
        order.buyerStateCode = invoice.buyerStateCode;
      }

      // Synchronize OrderItem collection so Order itemized towel consignment reflects edits
      if (Array.isArray(invoice.items) && invoice.items.length > 0) {
        try {
          await OrderItem.deleteMany({ order: order._id });
          const newOrderItemIds = [];
          const customerDisplayName = (order.customerDetails?.businessName || order.customerDetails?.name || '').trim();

          for (const invItem of invoice.items) {
            const prodId = invItem.product?._id || invItem.product;
            const isValidProdId = prodId && mongoose.Types.ObjectId.isValid(prodId);
            const qty = Math.max(1, parseInt(invItem.quantity, 10) || 1);
            const rate = Math.max(0, Number(invItem.price) || 0);

            const orderItemDoc = await OrderItem.create({
              order: order._id,
              customer: order.customer?._id || order.customer,
              customerName: customerDisplayName,
              product: isValidProdId ? prodId : null,
              productName: invItem.productName || 'White Towel',
              hsnCode: invItem.hsnCode || '6302.60',
              size: invItem.size || 'Standard',
              sizeRef: (invItem.sizeRef && mongoose.Types.ObjectId.isValid(invItem.sizeRef)) ? invItem.sizeRef : null,
              quantity: qty,
              price: rate,
              subtotal: qty * rate,
            });
            newOrderItemIds.push(orderItemDoc._id);
          }
          order.items = newOrderItemIds;
        } catch (itemSyncErr) {
          console.warn('[Admin Update Invoice] Error syncing OrderItems:', itemSyncErr.message);
        }
      }

      await order.save();
    }

    const populatedOrder = order ? await Order.findById(order._id)
      .populate('customer', 'name email phone companyName gstin')
      .populate('items')
      .populate('invoice') : null;

    return res.status(200).json({
      success: true,
      message: 'Bill details and tax invoice updated successfully.',
      invoice,
      order: populatedOrder || order,
    });
  } catch (error) {
    console.error('[Admin Update Invoice Error]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update bill details.',
    });
  }
};

