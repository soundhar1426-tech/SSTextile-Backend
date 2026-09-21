import express from 'express';
import {
  registerCustomer,
  loginCustomer,
  loginAdmin,
  getCurrentUser,
  updateProfile,
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public auth endpoints
router.post('/register', registerCustomer);
router.post('/login', loginCustomer);
router.post('/admin/login', loginAdmin);

// Protected auth endpoints
router.get('/me', protect, getCurrentUser);
router.put('/profile', protect, updateProfile);

export default router;
