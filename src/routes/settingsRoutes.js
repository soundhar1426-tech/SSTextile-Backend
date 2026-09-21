import express from 'express';
import { getSettings, updateSettings } from '../controllers/settingsController.js';
import { protect, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public route to get active mill settings
router.get('/settings', getSettings);

// Protected admin routes to get/update settings
router.get('/admin/settings', protect, requireAdmin, getSettings);
router.put('/admin/settings', protect, requireAdmin, updateSettings);

export default router;
