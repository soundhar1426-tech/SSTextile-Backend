import express from 'express';
import {
  getAdminProducts,
  getAdminProductById,
  createAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
  getInventorySummary,
} from '../controllers/productController.js';
import { protect, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require JWT authentication + Admin role
router.use(protect, requireAdmin);

router.route('/inventory/summary').get(getInventorySummary);

router.route('/')
  .get(getAdminProducts)
  .post(createAdminProduct);

router.route('/:id')
  .get(getAdminProductById)
  .put(updateAdminProduct)
  .delete(deleteAdminProduct);

export default router;
