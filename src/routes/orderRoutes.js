import express from 'express';
import {
  createOrder,
  getCustomerOrders,
  getOrderById,
  getOrderInvoice,
} from '../controllers/orderController.js';
import { updateInvoice } from '../controllers/adminOrderController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All customer order endpoints require authentication
router.use(protect);

router.route('/')
  .post(createOrder)
  .get(getCustomerOrders);

router.route('/:id')
  .get(getOrderById);

router.route('/:id/invoice')
  .get(getOrderInvoice)
  .put(updateInvoice);

export default router;
