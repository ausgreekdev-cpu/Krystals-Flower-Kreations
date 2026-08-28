import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const productSchema = z.object({
  title: z.string().min(2).max(200),
  slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().max(10000).optional(),
  type: z.enum(['physical','made_to_order','digital_template','workshop_ticket','commission']).default('physical'),
  stockMode: z.enum(['tracked','made_to_order','digital']).default('tracked'),
  price: z.number().nonnegative(),
  compareAtPrice: z.number().nonnegative().optional().nullable(),
  cost: z.number().nonnegative().optional().nullable(),
  sku: z.string().max(50).optional().nullable(),
  weightGrams: z.number().int().optional().nullable(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  paperStock: z.string().optional().nullable(),
  cricutCompatible: z.boolean().default(false),
  madeToOrderDays: z.number().int().optional().nullable(),
});

// Public: list + search
router.get('/', async (req, res) => {
  const { q, collection, featured, type, limit = '24', cursor } = req.query;
  const take = Math.min(parseInt(limit, 10) || 24, 60);
  const where = { isActive: true };
  if (featured === 'true') where.isFeatured = true;
  if (type) where.type = type;
  if (q) where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }];
  if (collection) where.collections = { some: { collection: { slug: collection } } };

  const products = await prisma.product.findMany({
    where, take, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
    include: { images: { orderBy: { sortOrder: 'asc' } }, variants: true, collections: { include: { collection: true } } },
  });
  res.json({ products, nextCursor: products.length === take ? products[products.length - 1].id : null });
});

router.get('/:slug', async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { slug: req.params.slug },
    include: { images: { orderBy: { sortOrder: 'asc' } }, variants: true, reviews: { where: { isApproved: true } }, collections: { include: { collection: true } } },
  });
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

// Admin: CRUD
router.post('/', requireAuth, requireRole('admin','developer','maker','staff'), validate(productSchema), async (req, res) => {
  const data = req.validated;
  const product = await prisma.product.create({ data: { ...data, price: data.price, compareAtPrice: data.compareAtPrice ?? undefined, cost: data.cost ?? undefined } });
  res.status(201).json(product);
});

router.patch('/:id', requireAuth, requireRole('admin','developer','maker','staff'), async (req, res) => {
  const product = await prisma.product.update({ where: { id: req.params.id }, data: req.body });
  res.json(product);
});

router.delete('/:id', requireAuth, requireRole('admin','developer'), async (req, res) => {
  await prisma.product.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
