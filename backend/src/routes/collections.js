import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
const requireAuth = authenticate;

router.get('/', asyncHandler(async (req, res) => {
  const all = req.query.all === '1' || req.query.all === 'true';
  if (all) {
    let authed = false;
    try { await new Promise((resolve, reject) => requireAuth(req, res, (err) => err ? reject(err) : resolve())); if (req.user && ['admin','developer','maker','staff'].includes(req.user.role)) authed = true; } catch {}
    if (!authed) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  }
  const cols = await prisma.collection.findMany({ where: all ? {} : { isActive: true }, orderBy: { sortOrder: 'asc' }, include: { products: { include: { product: { include: { images: true } } } } } });
  res.json(cols);
}));

// Public: single collection by slug (active only)
router.get('/:slug', asyncHandler(async (req, res) => {
  const slug = String(req.params.slug).slice(0,200);
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Invalid slug', code: 'validation_failed' });
  const col = await prisma.collection.findUnique({ where: { slug }, include: { products: { include: { product: { include: { images: true } } } } } });
  if (!col || !col.isActive) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  res.json(col);
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

// Admin: add a product to a collection (idempotent, sets sortOrder on create)
router.post('/:id/products', requireAuth, requireRole('admin','developer','maker','staff'), validate(z.object({ productId: z.string().min(8).max(100), sortOrder: z.number().int().finite().min(0).max(10000).optional() }).strict()), asyncHandler(async (req, res) => {
  const colId = String(req.params.id).slice(0,100);
  const col = await prisma.collection.findUnique({ where: { id: colId } });
  if (!col) return res.status(404).json({ error: 'Collection not found', code: 'not_found' });
  const product = await prisma.product.findUnique({ where: { id: req.validated.productId } });
  if (!product) return res.status(404).json({ error: 'Product not found', code: 'not_found' });
  const link = await prisma.collectionProduct.upsert({
    where: { collectionId_productId: { collectionId: colId, productId: req.validated.productId } },
    create: { collectionId: colId, productId: req.validated.productId, sortOrder: req.validated.sortOrder ?? 0 },
    update: { sortOrder: req.validated.sortOrder ?? 0 },
  });
  res.status(201).json(link);
}));

// Admin: remove a product from a collection
router.delete('/:id/products/:productId', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const colId = String(req.params.id).slice(0,100);
  const productId = String(req.params.productId).slice(0,100);
  await prisma.collectionProduct.deleteMany({ where: { collectionId: colId, productId } });
  res.json({ ok: true });
}));

// Admin: set sortOrder on an existing membership
router.patch('/:id/products/:productId', requireAuth, requireRole('admin','developer','maker','staff'), validate(z.object({ sortOrder: z.number().int().finite().min(0).max(10000) }).strict()), asyncHandler(async (req, res) => {
  const link = await prisma.collectionProduct.update({
    where: { collectionId_productId: { collectionId: String(req.params.id).slice(0,100), productId: String(req.params.productId).slice(0,100) } },
    data: { sortOrder: req.validated.sortOrder },
  });
  res.json(link);
}));

export default router;
