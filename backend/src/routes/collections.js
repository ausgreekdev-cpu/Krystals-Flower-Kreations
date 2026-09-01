import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
const requireAuth = authenticate;

router.get('/', asyncHandler(async (req, res) => {
  const cols = await prisma.collection.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, include: { products: { include: { product: { include: { images: true } } } } } });
  res.json(cols);
}));

const collectionSchema = z.object({
  title: z.string().min(2).max(200),
  slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().max(10000).optional().nullable(),
  imageUrl: z.string().url().max(500).optional().nullable(),
  sortOrder: z.number().int().finite().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
}).strict();

router.post('/', requireAuth, requireRole('admin','developer','maker','staff'), validate(collectionSchema), asyncHandler(async (req, res) => {
  const col = await prisma.collection.create({ data: req.validated });
  res.status(201).json(col);
}));

router.patch('/:id', requireAuth, requireRole('admin','developer','maker','staff'), validate(collectionSchema.partial()), asyncHandler(async (req, res) => {
  const col = await prisma.collection.update({ where: { id: String(req.params.id).slice(0,100) }, data: req.validated });
  res.json(col);
}));

router.delete('/:id', requireAuth, requireRole('admin','developer'), asyncHandler(async (req, res) => {
  await prisma.collection.delete({ where: { id: String(req.params.id).slice(0,100) } });
  res.json({ ok: true });
}));

export default router;
