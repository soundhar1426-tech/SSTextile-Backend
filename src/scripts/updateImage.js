import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gowtham_tex';
const DEFAULT_IMAGE = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCCdKqsvfuy2yau3AySGBI8zrrt1U9ghlW3X5wsoSzGBmztb7AyEZEhYV6EL6hsHNIBYMWtdL482GVLBRWvqbV0yTmpIlrmoJph838qaVWq9l1eDuxkE1I__-yKdS3oaLCCRrHpvWejMDeHWnT87rkOyHa0EKZu56Gbw6hoaMcb3hM9wIo5pCxDGGx6g7JtSEJY9wy9ZOXaAhzH4nphAIFBcgFZ6Bb85_5NECSf6XaYsx6x0NyYuSCwXw';

async function run() {
  await mongoose.connect(MONGODB_URI);
  const products = await mongoose.connection.db.collection('products').find().toArray();
  for (const p of products) {
    if (!p.images || p.images.length === 0 || p.images[0].includes('example.com')) {
      await mongoose.connection.db.collection('products').updateOne(
        { _id: p._id },
        { $set: { images: [DEFAULT_IMAGE] } }
      );
      console.log(`Updated images for product "${p.name}"`);
    }
  }
  console.log('All product images verified.');
  await mongoose.disconnect();
}

run();
