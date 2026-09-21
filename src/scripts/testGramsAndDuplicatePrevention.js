import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 TESTING GRAMS ADDITION & DUPLICATE SIZE PREVENTION');
  console.log('======================================================\n');

  // 1. Admin Login
  console.log('1. Logging in as Admin...');
  const adminLogin = await axios.post(`${BASE_URL}/auth/login`, {
    email: 'admin@gowthamtex.com',
    password: 'admin123',
  });
  const adminToken = adminLogin.data.token;
  console.log('  ✓ Admin logged in. Token acquired.');

  const authHeaders = { headers: { Authorization: `Bearer ${adminToken}` } };

  // 2. Fetch White Towels Product
  console.log('\n2. Fetching products to get canonical White Towels product ID...');
  const prodRes = await axios.get(`${BASE_URL}/admin/products`, authHeaders);
  const whiteTowel = prodRes.data.products.find(p => p.name === 'White Towels');
  if (!whiteTowel) {
    throw new Error('White Towels product not found!');
  }
  const productId = whiteTowel._id;
  console.log(`  ✓ Product ID: ${productId} (${whiteTowel.sizes.length} existing sizes)`);
  console.log(`  ✓ First size: ${whiteTowel.sizes[0].size} • ${whiteTowel.sizes[0].grams}g (${whiteTowel.sizes[0].gsm} GSM)`);

  // 3. Admin Adds New Size with explicit Grams (e.g. 50x90 cm, 248 grams)
  console.log('\n3. Admin adding new dynamic size "50x90" with explicit grams (248g)...');
  const addRes = await axios.post(`${BASE_URL}/admin/products/${productId}/sizes`, {
    size: '50x90',
    price: 180,
    stock: 120,
    gsm: 550,
    grams: 248,
  }, authHeaders);

  if (!addRes.data.success || !addRes.data.size) {
    throw new Error('Failed to add size with grams');
  }
  const createdSize = addRes.data.size;
  console.log(`  ✓ Size created successfully: ID=${createdSize.id}, size=${createdSize.size}, grams=${createdSize.grams}g, price=₹${createdSize.price}`);

  if (createdSize.grams !== 248) {
    throw new Error(`Expected grams 248, got ${createdSize.grams}`);
  }

  // 4. Test Duplicate Prevention: Try to add "50x90" again (exact same dimension)
  console.log('\n4. Testing duplicate rejection on exact match ("50x90")...');
  let duplicateRejected1 = false;
  try {
    await axios.post(`${BASE_URL}/admin/products/${productId}/sizes`, {
      size: '50x90',
      price: 180,
      stock: 120,
      gsm: 550,
      grams: 248,
    }, authHeaders);
  } catch (err) {
    if (err.response?.status === 400 && err.response?.data?.message?.includes('already exists')) {
      duplicateRejected1 = true;
      console.log(`  ✓ Duplicate correctly rejected with 400 Bad Request: "${err.response.data.message}"`);
    } else {
      console.error('Unexpected error:', err.response?.data || err.message);
    }
  }

  if (!duplicateRejected1) {
    throw new Error('Duplicate "50x90" was NOT rejected!');
  }

  // 5. Test Duplicate Prevention with Variations (e.g. " 50 X 90 cm ")
  console.log('\n5. Testing duplicate rejection on formatting variations (" 50 X 90 cm ")...');
  let duplicateRejected2 = false;
  try {
    await axios.post(`${BASE_URL}/admin/products/${productId}/sizes`, {
      size: ' 50 X 90 cm ',
      price: 190,
      stock: 50,
      gsm: 550,
      grams: 248,
    }, authHeaders);
  } catch (err) {
    if (err.response?.status === 400 && err.response?.data?.message?.includes('already exists')) {
      duplicateRejected2 = true;
      console.log(`  ✓ Duplicate variation correctly rejected: "${err.response.data.message}"`);
    } else {
      console.error('Unexpected error:', err.response?.data || err.message);
    }
  }

  if (!duplicateRejected2) {
    throw new Error('Duplicate variation " 50 X 90 cm " was NOT rejected!');
  }

  // 6. Test Updating Grams on the created size (e.g. update to 260 grams)
  console.log('\n6. Testing quick grams update on size...');
  const updateRes = await axios.put(`${BASE_URL}/admin/sizes/${createdSize.id}`, {
    grams: 260,
  }, authHeaders);

  if (updateRes.data.size?.grams !== 260) {
    throw new Error(`Expected updated grams to be 260, got ${updateRes.data.size?.grams}`);
  }
  console.log(`  ✓ Size grams updated to ${updateRes.data.size.grams}g (weightKg=${updateRes.data.size.weightKg})`);

  // 7. Test Public Customer Endpoint
  console.log('\n7. Verifying public customer product catalog returns grams...');
  const publicRes = await axios.get(`${BASE_URL}/products`);
  const pubWhiteTowel = publicRes.data.products.find(p => p.name === 'White Towels');
  const pubSize = pubWhiteTowel.sizes.find(s => s.size === '50x90');
  if (!pubSize || pubSize.grams !== 260) {
    throw new Error(`Public size missing or grams incorrect: ${JSON.stringify(pubSize)}`);
  }
  console.log(`  ✓ Public catalog size: ${pubSize.dimension} • ${pubSize.grams}g • ₹${pubSize.price}`);

  // 8. Clean up the test size
  console.log('\n8. Deactivating test size...');
  await axios.delete(`${BASE_URL}/admin/sizes/${createdSize.id}`, authHeaders);
  console.log('  ✓ Test size cleaned up.');

  console.log('\n======================================================');
  console.log('🎉 ALL GRAMS & DUPLICATE PREVENTION TESTS PASSED 100%!');
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
