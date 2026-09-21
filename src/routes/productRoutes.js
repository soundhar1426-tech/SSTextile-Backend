import express from 'express';
import {
  getPublicProducts,
  getPublicProductById,
} from '../controllers/customerProductController.js';

const router = express.Router();

// Public Customer Product Endpoints
router.get('/', getPublicProducts);
router.get('/:id', getPublicProductById);

export default router;
