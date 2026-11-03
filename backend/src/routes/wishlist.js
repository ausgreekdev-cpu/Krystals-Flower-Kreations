import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();

// List current user's wishlist
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const items = await prisma.wishlist.findMany({
    where: { userId: req.user.id },
    include: { product: { include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(items);
}));

// Add to wishlist
const addSchema = z.object({
  productId: z.string().min(8).max(100),
  variantId: z.string().min(8).max(100).optional().nullable(),
}).strict();

router.post('/', authenticate, validate(addSchema), asyncHandler(async (req, res) => {
  const { productId, variantId } = req.validated;
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return res.status(404).json({ error: 'Product not found', code: 'not_found' });
  try {
    const item = await prisma.wishlist.create({
      data: { userId: req.user.id, productId, variantId: variantId || null },
      include: { product: { include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } } } },
    });
    res.status(201).json(item);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Already in wishlist', code: 'conflict' });
    throw e;
  }
}));

// Remove from wishlist
router.delete('/:productId', authenticate, asyncHandler(async (req, res) => {
  const productId = String(req.params.productId).slice(0, 100);
  await prisma.wishlist.deleteMany({ where: { userId: req.user.id, productId } });
  res.json({ ok: true });
}));

export default router;