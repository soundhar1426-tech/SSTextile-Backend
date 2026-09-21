import express from 'express';
import {
  getProductSizes,
  createProductSize,
  updateSize,
  deleteSize,
} from '../controllers/sizeController.js';
import { protect, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require JWT authentication + Admin role
router.use(protect, requireAdmin);

// Routes scoped under product
router.route('/products/:productId/sizes')
  .get(getProductSizes)
  .post(createProductSize);

// Direct size manipulation
router.route('/sizes/:id')
  .put(updateSize)
  .delete(deleteSize);

export default router;
