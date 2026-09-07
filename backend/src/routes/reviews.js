import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { rateLimit } from '../middleware/rate-limit.js';

const router = Router();

const reviewSchema = z.object({
  productId: z.string().min(8).max(100),
  name: z.string().min(2).max(100),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(200).optional().nullable(),
  body: z.string().max(2000).optional().nullable(),
  images: z.string().max(5000).optional().nullable(),
}).strict();

// Public: list approved reviews for product, create review (anyone)
router.get('/product/:productId', asyncHandler(async (req, res) => {
  const productId = String(req.params.productId).slice(0,100);
  const reviews = await prisma.review.findMany({ where: { productId, isApproved: true }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json(reviews);
}));

router.post('/', rateLimit('review_create', 5, 60), validate(reviewSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  const product = await prisma.product.findUnique({ where: { id: data.productId } });
  if (!product) return res.status(404).json({ error: 'Product not found', code: 'not_found' });
  const review = await prisma.review.create({ data: { ...data, userId: req.user?.id || null } });
  res.status(201).json(review);
}));

// Maker+ : approve, list pending, delete
router.get('/pending', authenticate, requireRole('admin','developer','maker'), asyncHandler(async (req, res) => {
  const pending = await prisma.review.findMany({ where: { isApproved: false }, orderBy: { createdAt: 'desc' }, take: 50, include: { product: { select: { title: true, slug: true } } } });
  res.json(pending);
}));

router.post('/:id/approve', authenticate, requireRole('admin','developer','maker'), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0,100);
  const review = await prisma.review.update({ where: { id }, data: { isApproved: true } });
  // Earn 10 pts for review photo if provided
  if (review.images) {
    try {
      const email = review.userId ? (await prisma.user.findUnique({ where: { id: review.userId } }))?.email : null;
      const targetEmail = email || review.name; // fallback
      // Find loyalty account by product? For $0, just try to award if email looks like email
      if (targetEmail && targetEmail.includes('@')) {
        let acc = await prisma.loyaltyAccount.findUnique({ where: { email: targetEmail } });
        if (!acc) acc = await prisma.loyaltyAccount.create({ data: { email: targetEmail, points: 0, tier: 'seedling' } });
        const newPoints = acc.points + 10;
        const tier = newPoints >= 500 ? 'garden' : newPoints >= 100 ? 'blossom' : 'seedling';
        await prisma.loyaltyAccount.update({ where: { id: acc.id }, data: { points: newPoints, tier } });
        await prisma.loyaltyTransaction.create({ data: { accountId: acc.id, pointsDelta: 10, reason: 'review' } });
      }
    } catch {}
  }
  res.json(review);
}));

router.delete('/:id', authenticate, requireRole('admin','developer'), asyncHandler(async (req, res) => {
  await prisma.review.delete({ where: { id: String(req.params.id).slice(0,100) } });
  res.json({ ok: true });
}));

export default router;
