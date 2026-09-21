import mongoose from 'mongoose';

async function updateDbSettings() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/gowtham_tex');
    const update = {
      name: 'GOWTHAM TEX',
      tagline: 'Whole Sale Hand Looms Cloth Manufacturer',
      subTagline: 'Direct Mill White Towels',
      address: 'D/No. 1/144, Devanampalayam, VELLIRAVELI (P.O.), Kunnathur - 638 103. (Via) Tirupur Dt. Tamilnadu.',
      phone: '80728 65362, 94890 40067, 95666 47834',
      whatsapp: '918072865362',
      email: 'orders@gowthamtex.com',
      gstin: '33BRWPV7711D1ZD',
      pan: 'BRWPV7711D',
      stateCode: '33',
      placeOfSupply: 'Tamil Nadu (33)',
    };
    const res = await mongoose.connection.db.collection('settings').updateMany({}, { $set: update });
    console.log('MongoDB settings update result:', res);
    
    // Also update any admin users
    const userRes = await mongoose.connection.db.collection('users').updateMany(
      { role: 'admin' },
      { $set: { gstin: '33BRWPV7711D1ZD', phone: '8072865362' } }
    );
    console.log('Admin user update result:', userRes);

    const doc = await mongoose.connection.db.collection('settings').findOne();
    console.log('Updated Settings Document:', doc);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error updating settings:', err);
    process.exit(1);
  }
}

updateDbSettings();
