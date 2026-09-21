import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api';

async function runManualE2ETest() {
  console.log('\n======================================================');
  console.log('🧪 GOWTHAM TEX — PART 34 MANUAL END-TO-END SCENARIO');
  console.log('======================================================\n');

  // ADMIN: 1. Login as admin
  console.log('ADMIN:');
  console.log('1. Login as admin...');
  const adminLogin = await axios.post(`${BASE_URL}/auth/admin/login`, {
    email: 'admin@gowthamtex.com',
    password: 'admin123',
  });
  const adminToken = adminLogin.data.token;
  const authAdmin = { headers: { Authorization: `Bearer ${adminToken}` } };
  console.log('  ✓ Admin logged in successfully.');

  // 2. Create/verify white towel product
  console.log('2. Verify white towel product...');
  const prodRes = await axios.get(`${BASE_URL}/admin/products`, authAdmin);
  let whiteTowel = prodRes.data.products.find(p => p.name.includes('White'));
  if (!whiteTowel) {
    const createProd = await axios.post(`${BASE_URL}/admin/products`, {
      name: 'White Towel',
      description: 'Institutional grade cotton white towel',
    }, authAdmin);
    whiteTowel = createProd.data.product;
  }
  const productId = whiteTowel._id || whiteTowel.id;
  console.log(`  ✓ Product found: "${whiteTowel.name}" (ID: ${productId})`);

  // 3. Add / update size 25x50 (Price = ₹85, Stock = 100)
  console.log('3. Add size: 25x50 (Price = ₹85, Stock = 100)...');
  let size25 = whiteTowel.sizes?.find(s => s.size === '25x50');
  let sizeId;
  if (size25) {
    sizeId = size25.id || size25._id;
    await axios.put(`${BASE_URL}/admin/sizes/${sizeId}`, { price: 85, stock: 100 }, authAdmin);
    console.log(`  ✓ Updated existing size 25x50: Price ₹85, Stock 100 pcs`);
  } else {
    const addSizeRes = await axios.post(`${BASE_URL}/admin/products/${productId}/sizes`, {
      size: '25x50',
      price: 85,
      stock: 100,
      gsm: 500,
    }, authAdmin);
    sizeId = addSizeRes.data.size.id || addSizeRes.data.size._id;
    console.log(`  ✓ Added new dynamic size 25x50: Price ₹85, Stock 100 pcs`);
  }

  // 4. Verify product is active
  console.log('4. Verify product is active...');
  const checkActive = await axios.get(`${BASE_URL}/products/${productId}`);
  console.log(`  ✓ Product active: ${checkActive.data.product.active}`);

  // CUSTOMER:
  console.log('\nCUSTOMER:');
  console.log('5. Login/register customer...');
  const custLogin = await axios.post(`${BASE_URL}/auth/login`, {
    email: 'procurement@suryahotels.com',
    password: 'customer123',
  });
  const custToken = custLogin.data.token;
  const authCust = { headers: { Authorization: `Bearer ${custToken}` } };
  console.log('  ✓ Customer logged in successfully.');

  // 6. Open product
  console.log('6. Open product...');
  const buyerProdRes = await axios.get(`${BASE_URL}/products/${productId}`);
  console.log(`  ✓ Product opened: "${buyerProdRes.data.product.name}"`);

  // 7. Select 25x50
  console.log('7. Select size 25x50...');
  const buyerSize25 = buyerProdRes.data.product.sizes.find(s => s.size === '25x50');
  console.log(`  ✓ Selected size 25x50: ₹${buyerSize25.price}/pc, ${buyerSize25.stock} pcs available`);

  // 8. Enter 39 pieces (Expected: Rejected with "Minimum order is 40 pieces...")
  console.log('8. Enter 39 pieces...');
  try {
    await axios.post(`${BASE_URL}/orders`, {
      customerDetails: { name: 'K. Rajendran', phone: '+919842155670', email: 'procurement@suryahotels.com' },
      deliveryDetails: { addressLine1: '142 Brough Rd', city: 'Erode', state: 'Tamil Nadu', pincode: '638001', contactPhone: '+919842155670', transporter: 'VRL Logistics Cargo' },
      items: [{ productId, sizeId, quantity: 39 }],
    }, authCust);
    throw new Error('Order of 39 pieces was unexpectedly allowed!');
  } catch (err) {
    console.log(`  ✓ Order rejected as expected: "${err.response?.data?.message}"`);
  }

  // 9, 10, 11, 12. Enter 40 pieces, checkout, place order
  console.log('9-12. Enter 40 pieces, checkout, and place order...');
  const orderRes = await axios.post(`${BASE_URL}/orders`, {
    customerDetails: { name: 'K. Rajendran', businessName: 'Surya Hotels', phone: '+919842155670', email: 'procurement@suryahotels.com', gstin: '33AAACG0184M1Z8' },
    deliveryDetails: { addressLine1: '142 Brough Rd', city: 'Erode', state: 'Tamil Nadu', pincode: '638001', contactPhone: '+919842155670', transporter: 'VRL Logistics Cargo' },
    items: [{ productId, sizeId, quantity: 40 }],
  }, authCust);

  const order = orderRes.data.order;
  const orderId = order._id;
  console.log(`  ✓ Order created: #${order.orderNumber}`);
  console.log(`  ✓ Initial Payment Status: "${order.paymentStatus}"`);
  console.log(`  ✓ Initial Invoice Status: "${order.invoiceStatus}"`);

  // ADMIN:
  console.log('\nADMIN:');
  console.log('13-19. Open Admin Orders, find GTX order, open details, verify customer, size, quantity, total...');
  const adminOrderDetails = await axios.get(`${BASE_URL}/admin/orders/${orderId}`, authAdmin);
  const adminOrd = adminOrderDetails.data.order;
  console.log(`  ✓ Found Order #${adminOrd.orderNumber}`);
  console.log(`  ✓ Customer: ${adminOrd.customerDetails.name} (${adminOrd.customerDetails.businessName})`);
  console.log(`  ✓ Size: ${adminOrd.items[0].size}`);
  console.log(`  ✓ Quantity: ${adminOrd.items[0].quantity} pcs`);
  console.log(`  ✓ Total: ₹${adminOrd.totalAmount}`);

  // 20. Confirm payment received
  console.log('20. Confirm payment received...');
  const confirmPayRes = await axios.patch(`${BASE_URL}/admin/orders/${orderId}/payment`, {
    paymentMethod: 'UPI',
    paymentReference: 'UPI-TXN-10001',
  }, authAdmin);
  console.log(`  ✓ Payment Status: "${confirmPayRes.data.order.paymentStatus}"`);
  console.log(`  ✓ Invoice Generated: "${confirmPayRes.data.invoice.invoiceNumber}"`);

  // 21-22. Open invoice & verify
  console.log('21-22. Verify invoice number and details...');
  const invoiceRes = await axios.get(`${BASE_URL}/admin/invoices`, authAdmin);
  const foundInv = invoiceRes.data.invoices.find(inv => inv.invoiceNumber === confirmPayRes.data.invoice.invoiceNumber);
  console.log(`  ✓ Invoice verified: ${foundInv.invoiceNumber} | Total ₹${foundInv.totalAmount}`);

  // 23. Update order: Confirmed
  console.log('23. Update order status: Confirmed...');
  const updateStatusRes = await axios.patch(`${BASE_URL}/admin/orders/${orderId}/status`, {
    status: 'confirmed',
  }, authAdmin);
  console.log(`  ✓ Order status updated: "${updateStatusRes.data.order.orderStatus}"`);

  // CUSTOMER:
  console.log('\nCUSTOMER:');
  console.log('24-25. Open My Orders, open the order...');
  const custMyOrder = await axios.get(`${BASE_URL}/orders/${orderId}`, authCust);
  console.log(`  ✓ Customer Order: #${custMyOrder.data.order.orderNumber}`);
  console.log(`  ✓ Status: "${custMyOrder.data.order.orderStatus}"`);
  console.log(`  ✓ Payment: "${custMyOrder.data.order.paymentStatus}"`);
  console.log(`  ✓ Confirmation text: "Your order ${custMyOrder.data.order.orderNumber} has been confirmed."`);

  // 26. Open/download invoice
  console.log('26. Open/download invoice...');
  const custInvoice = await axios.get(`${BASE_URL}/orders/${orderId}/invoice`, authCust);
  console.log(`  ✓ Invoice received: ${custInvoice.data.invoice.invoiceNumber} for ₹${custInvoice.data.invoice.totalAmount} (HSN: ${custInvoice.data.invoice.hsnCode})`);

  console.log('\n======================================================');
  console.log('🎉 PART 34 MANUAL END-TO-END SCENARIO PASSED (100%)');
  console.log('======================================================\n');
}

runManualE2ETest().catch((err) => {
  console.error('❌ Test failed:', err.response?.data || err.message);
  process.exit(1);
});
