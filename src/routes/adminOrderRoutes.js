import express from 'express';
import {
  getAllOrders,
  getAdminOrderById,
  updateOrderStatus,
  confirmOrderPayment,
  getAllInvoices,
  updateInvoice,
  getAdminCustomers,
  updateAdminCustomer,
} from '../controllers/adminOrderController.js';
import { protect, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// All admin order, customer & invoice routes require protect and requireAdmin
router.use(protect, requireAdmin);

router.route('/orders')
  .get(getAllOrders);

router.route('/orders/:id')
  .get(getAdminOrderById);

router.route('/orders/:id/status')
  .patch(updateOrderStatus);

router.route('/orders/:id/payment')
  .patch(confirmOrderPayment);

router.route('/orders/:id/invoice')
  .put(updateInvoice);

router.route('/invoices')
  .get(getAllInvoices);

router.route('/invoices/:id')
  .put(updateInvoice);

router.route('/customers')
  .get(getAdminCustomers);

router.route('/customers/:id')
  .put(updateAdminCustomer);

export default router;

