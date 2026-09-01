import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
const requireAuth = authenticate;

const variantSchema = z.object({
  title: z.string().min(2).max(200),
  sku: z.string().max(50).optional().nullable(),
  barcode: z.string().max(50).optional().nullable(),
  option1: z.string().max(50).optional().nullable(),
  option2: z.string().max(50).optional().nullable(),
  option3: z.string().max(50).optional().nullable(),
  price: z.number().finite().nonnegative().max(1000000),
  compareAtPrice: z.number().finite().nonnegative().max(1000000).optional().nullable(),
  inventoryQuantity: z.number().int().finite().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
}).strict();

router.post('/products/:productId/variants', requireAuth, requireRole('admin','developer','maker','staff'), validate(variantSchema), asyncHandler(async (req, res) => {
  const productId = String(req.params.productId).slice(0,100);
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return res.status(404).json({ error: 'Product not found', code: 'not_found' });
  const variant = await prisma.productVariant.create({ data: { ...req.validated, productId } });
  res.status(201).json(variant);
}));

router.patch('/variants/:id', requireAuth, requireRole('admin','developer','maker','staff'), validate(variantSchema.partial()), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0,100);
  const variant = await prisma.productVariant.update({ where: { id }, data: req.validated });
  res.json(variant);
}));

router.delete('/variants/:id', requireAuth, requireRole('admin','developer'), asyncHandler(async (req, res) => {
  await prisma.productVariant.delete({ where: { id: String(req.params.id).slice(0,100) } });
  res.json({ ok: true });
}));

export default router;
