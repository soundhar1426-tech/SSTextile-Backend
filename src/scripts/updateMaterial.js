import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/gtex';

async function run() {
  try {
    await mongoose.connect(mongoUri);
    const res = await mongoose.connection.collection('products').updateMany(
      { $or: [{ material: { $regex: /combed/i } }, { material: { $regex: /100%/i } }] },
      { $set: { material: 'Cotton' } }
    );
    console.log('Successfully updated product materials:', res.modifiedCount);
  } catch (err) {
    console.error('Error updating materials:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
