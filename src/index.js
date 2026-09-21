import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
// Reload env: 2026-09-21T17:58:00
dotenv.config();
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import adminProductRoutes from './routes/adminProductRoutes.js';
import adminSizeRoutes from './routes/adminSizeRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import adminOrderRoutes from './routes/adminOrderRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import { protect, requireAdmin } from './middleware/authMiddleware.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Core Middleware - CORS configuration supporting optional environment origins with dev fallback
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors({
  origin: corsOrigin ? (corsOrigin.includes(',') ? corsOrigin.split(',').map(o => o.trim()) : corsOrigin) : true,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Public Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    service: 'Gowtham Tex B2B Wholesale API',
    database: 'MongoDB (gowtham_tex)',
    timestamp: new Date().toISOString(),
  });
});

// Authentication Routes
app.use('/api/auth', authRoutes);

// Public Customer Product Routes
app.use('/api/products', productRoutes);

// Protected Customer Order Routes
app.use('/api/orders', orderRoutes);

// Public & Admin Mill Settings
app.use('/api', settingsRoutes);

// Protected Admin Verification Endpoint
app.get('/api/admin/verify', protect, requireAdmin, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Admin authorization verified',
    admin: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

// Admin Product, Size, Order & Invoice Management Routes (Protected by protect + requireAdmin)
app.use('/api/admin/products', adminProductRoutes);
app.use('/api/admin', adminSizeRoutes);
app.use('/api/admin', adminOrderRoutes);

// 404 Not Found Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// Start Server & Connect Database (Only if executed directly)
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('index.js') || 
  process.argv[1].endsWith('src\\index.js') || 
  process.argv[1].endsWith('src/index.js')
);

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`[Server] Gowtham Tex Backend running on port: ${PORT}`);
      console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
    });
  });
}

export default app;
