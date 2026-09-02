import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate, querySchemas } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { upload } from '../middleware/upload.js';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
const requireAuth = authenticate;

const router = Router();

const productSchema = z.object({
  title: z.string().min(2).max(200),
  slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().max(10000).optional(),
  type: z.enum(['physical','made_to_order','digital_template','workshop_ticket','commission']).default('physical'),
  stockMode: z.enum(['tracked','made_to_order','digital']).default('tracked'),
  price: z.number().finite().nonnegative().max(1000000),
  compareAtPrice: z.number().finite().nonnegative().max(1000000).optional().nullable(),
  cost: z.number().finite().nonnegative().max(1000000).optional().nullable(),
  sku: z.string().max(50).optional().nullable(),
  weightGrams: z.number().int().finite().min(0).max(100000).optional().nullable(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  paperStock: z.string().max(200).optional().nullable(),
  cricutCompatible: z.boolean().default(false),
  madeToOrderDays: z.number().int().finite().min(0).max(90).optional().nullable(),
}).strict();
const productPatchSchema = productSchema.partial().strict();

// Public: list + search — validated query, finite limit, length-capped search
router.get('/', asyncHandler(async (req, res) => {
  const raw = querySchemas.products.safeParse(req.query);
  if (!raw.success) return res.status(400).json({ error: 'Invalid query', code: 'invalid_query', details: raw.error.flatten() });
  const { q, collection, featured, type, limit, cursor } = raw.data;
  const take = limit;
  const where = { isActive: true };
  if (featured === 'true') where.isFeatured = true;
  if (type) where.type = type;
  if (q) {
    const qq = q.slice(0,200);
    where.OR = [{ title: { contains: qq, mode: 'insensitive' } }, { description: { contains: qq, mode: 'insensitive' } }, { sku: { contains: qq, mode: 'insensitive' } }];
  }
  if (collection) where.collections = { some: { collection: { slug: String(collection).slice(0,100) } } };
  const products = await prisma.product.findMany({
    where, take, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
    include: { images: { orderBy: { sortOrder: 'asc' } }, variants: true, collections: { include: { collection: true } } },
  });
  res.json({ products, nextCursor: products.length === take ? products[products.length - 1].id : null });
}));

router.get('/:slug', asyncHandler(async (req, res) => {
  const slug = String(req.params.slug).slice(0,200);
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Invalid slug', code: 'validation_failed' });
  const product = await prisma.product.findUnique({
    where: { slug },
    include: { images: { orderBy: { sortOrder: 'asc' } }, variants: true, reviews: { where: { isApproved: true } }, collections: { include: { collection: true } } },
  });
  if (!product) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  res.json(product);
}));

// Admin: CRUD — strict, finite, audit
router.post('/', requireAuth, requireRole('admin','developer','maker','staff'), validate(productSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  const product = await prisma.product.create({ data: { ...data, price: data.price, compareAtPrice: data.compareAtPrice ?? undefined, cost: data.cost ?? undefined } });
  // audit log for price changes
  try { await prisma.metaSyncLog.create({ data: { action: 'product_create', productId: product.id, status: 'success', message: `Created ${product.title} $${product.price} by ${req.user.email}` } }); } catch {}
  res.status(201).json(product);
}));

router.patch('/:id', requireAuth, requireRole('admin','developer','maker','staff'), validate(productPatchSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  if (Object.keys(data).length===0) return res.status(400).json({ error: 'No fields to update', code: 'validation_failed' });
  const before = await prisma.product.findUnique({ where: { id: req.params.id }, select: { price: true, title: true } });
  const product = await prisma.product.update({ where: { id: req.params.id }, data });
  if (before && data.price !== undefined && String(before.price) !== String(data.price)) {
    try { await prisma.metaSyncLog.create({ data: { action: 'product_price_update', productId: product.id, status: 'success', message: `Price ${before.price}→${data.price} by ${req.user.email}` } }); } catch {}
  }
  res.json(product);
}));

router.delete('/:id', requireAuth, requireRole('admin','developer'), asyncHandler(async (req, res) => {
  await prisma.product.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// Product images upload — $0 sharp resize 800x800, stored in backend/uploads/products, served via /uploads
router.post('/:id/images', requireAuth, requireRole('admin','developer','maker','staff'), upload.array('images', 5), asyncHandler(async (req, res) => {
  const productId = String(req.params.id).slice(0,100);
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return res.status(404).json({ error: 'Product not found', code: 'not_found' });
  if (!req.files || req.files.length===0) return res.status(400).json({ error: 'No images', code: 'validation_failed' });
  const uploadDir = path.resolve('backend/uploads/products');
  fs.mkdirSync(uploadDir, { recursive: true });
  const created = [];
  for (const file of req.files) {
    const resized = await sharp(file.buffer).resize(800,800, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const filename = `${productId}-${Date.now()}-${Math.random().toString(36).slice(2,6)}.jpg`;
    const filepath = path.join(uploadDir, filename);
    fs.writeFileSync(filepath, resized);
    const url = `/uploads/products/${filename}`;
    const img = await prisma.productImage.create({ data: { productId, url, alt: file.originalname.slice(0,200), sortOrder: 0 } });
    created.push(img);
  }
  res.status(201).json(created);
}));

export default router;
