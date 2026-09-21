import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';

async function testAdminEmailEditable() {
  console.log('--- Testing Admin Email Editable Functionality ---');

  // 1. Initial login with master admin
  console.log('1. Logging in with initial admin email: admin@sstextiles.com...');
  const loginRes1 = await axios.post(`${API_BASE}/auth/admin/login`, {
    email: 'admin@sstextiles.com',
    password: 'admin123',
  });

  if (!loginRes1.data.success || !loginRes1.data.token) {
    throw new Error('Initial admin login failed: ' + JSON.stringify(loginRes1.data));
  }
  let token = loginRes1.data.token;
  const initialUser = loginRes1.data.user;
  console.log(`✓ Admin logged in successfully: ID ${initialUser.id}, Email: ${initialUser.email}, Role: ${initialUser.role}`);

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  // 2. Update Admin Email via PUT /api/auth/profile
  const newAdminEmail = 'admin.manager@sstextiles.com';
  console.log(`\n2. Updating Admin Email via PUT /api/auth/profile to "${newAdminEmail}"...`);
  const updateProfileRes = await axios.put(`${API_BASE}/auth/profile`, {
    name: 'SSTextiles Mill Director',
    email: newAdminEmail,
    phone: '98765 43210',
  }, authHeaders);

  if (!updateProfileRes.data.success || updateProfileRes.data.user.email !== newAdminEmail) {
    throw new Error('updateProfile failed: ' + JSON.stringify(updateProfileRes.data));
  }
  console.log(`✓ Admin profile updated. New email in profile: ${updateProfileRes.data.user.email}`);

  // 3. Update Mill Settings via PUT /api/admin/settings
  console.log(`\n3. Updating Mill Settings via PUT /api/admin/settings...`);
  const updateSettingsRes = await axios.put(`${API_BASE}/admin/settings`, {
    millSettings: {
      name: 'SSTextiles',
      email: newAdminEmail,
      adminEmail: newAdminEmail,
      phone: '98765 43210, 98765 43211',
    },
  }, authHeaders);

  if (!updateSettingsRes.data.success) {
    throw new Error('updateSettings failed: ' + JSON.stringify(updateSettingsRes.data));
  }
  console.log(`✓ Mill settings updated: Settings Email = ${updateSettingsRes.data.settings.email}`);

  // 4. Verify GET /api/auth/me returns updated email
  console.log(`\n4. Verifying GET /api/auth/me...`);
  const meRes = await axios.get(`${API_BASE}/auth/me`, authHeaders);
  if (!meRes.data.success || meRes.data.user.email !== newAdminEmail) {
    throw new Error('GET /api/auth/me did not return updated email: ' + JSON.stringify(meRes.data));
  }
  console.log(`✓ GET /api/auth/me verified: Email is "${meRes.data.user.email}"`);

  // 5. Test logging in with the newly updated admin email
  console.log(`\n5. Logging in with NEW admin email: ${newAdminEmail}...`);
  const loginRes2 = await axios.post(`${API_BASE}/auth/admin/login`, {
    email: newAdminEmail,
    password: 'admin123',
  });

  if (!loginRes2.data.success || !loginRes2.data.token) {
    throw new Error(`Login with new admin email ${newAdminEmail} failed: ` + JSON.stringify(loginRes2.data));
  }
  console.log(`✓ Successfully logged in with newly edited admin email! Token issued: ${loginRes2.data.token.slice(0, 20)}...`);

  // 6. Restore back to default admin@sstextiles.com
  console.log('\n6. Restoring admin email back to canonical admin@sstextiles.com...');
  const newToken = loginRes2.data.token;
  const restoreHeaders = { headers: { Authorization: `Bearer ${newToken}` } };

  await axios.put(`${API_BASE}/auth/profile`, {
    name: 'SSTextiles Admin',
    email: 'admin@sstextiles.com',
    phone: '98765 43210',
  }, restoreHeaders);

  await axios.put(`${API_BASE}/admin/settings`, {
    millSettings: {
      name: 'SSTextiles',
      email: 'admin@sstextiles.com',
      adminEmail: 'admin@sstextiles.com',
    },
  }, restoreHeaders);

  const verifyRestored = await axios.post(`${API_BASE}/auth/admin/login`, {
    email: 'admin@sstextiles.com',
    password: 'admin123',
  });

  if (verifyRestored.data.success) {
    console.log('✓ Admin email restored to admin@sstextiles.com and login verified!');
  }

  console.log('\n--- ALL ADMIN EMAIL EDITABLE TESTS PASSED 100% ---');
}

testAdminEmailEditable().catch((err) => {
  console.error('❌ Test failed:', err.response?.data || err.message);
  process.exit(1);
});
