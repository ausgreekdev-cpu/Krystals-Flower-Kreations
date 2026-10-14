import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate, querySchemas } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { upload, uploadDocs, docMimeLooksReal } from '../middleware/upload.js';
import { rateLimit } from '../middleware/rate-limit.js';
import sharp from 'sharp';
import crypto from 'crypto';
import { putObject, deleteObjectByUrl } from '../services/storage.js';
import { audit } from '../lib/audit.js';
import { registerFieldRoutes, validateCustomFields } from '../lib/fieldDefs.js';
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
  barcode: z.string().trim().max(50).optional().nullable(), // UPC-A / EAN-13 / Code128 label
  weightGrams: z.number().int().finite().min(0).max(100000).optional().nullable(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  paperStock: z.string().max(200).optional().nullable(),
  cricutCompatible: z.boolean().default(false),
  madeToOrderDays: z.number().int().finite().min(0).max(90).optional().nullable(),
  careInstructions: z.string().max(2000).optional().nullable(),
  // Florist specifics
  flowerType: z.string().max(50).optional().nullable(),
  colourFamily: z.string().max(50).optional().nullable(),
  stemLengthMm: z.number().int().finite().min(0).max(2000).optional().nullable(),
  occasions: z.array(z.string().max(50)).max(10).default([]),
  // Admin-defined custom fields — every key/type is checked against ProductField
  customFields: z.record(z.union([z.string().max(500), z.number().finite(), z.boolean()])).nullable().optional(),
}).strict();
const productPatchSchema = productSchema.partial().strict();

// Public: list + search — validated query, finite limit, length-capped search
router.get('/', asyncHandler(async (req, res) => {
  const raw = querySchemas.products.safeParse(req.query);
  if (!raw.success) return res.status(400).json({ error: 'Invalid query', code: 'invalid_query', details: raw.error.flatten() });
  const { q, collection, featured, type, flowerType, colourFamily, occasion, limit, cursor, all } = raw.data;
  const take = limit;
  const where = {};
  if (all === '1' || all === 'true') {
    // `all` (includes inactive) is staff-only — run auth inline so the public
    // route stays public for normal browsing
    let authed = false;
    try { await new Promise((resolve, reject) => requireAuth(req, res, (err) => err ? reject(err) : resolve())); if (req.user && ['admin','developer','maker','staff'].includes(req.user.role)) authed = true; } catch {}
    if (!authed) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
    where.deletedAt = null;
  } else {
    where.isActive = true;
    where.deletedAt = null;
  }
  if (featured === 'true') where.isFeatured = true;
  if (type) where.type = type;
  if (flowerType) where.flowerType = flowerType.slice(0, 50);
  if (colourFamily) where.colourFamily = colourFamily.slice(0, 50);
  if (occasion) where.occasions = { has: occasion.slice(0, 50) };
  if (q) {
    const qq = q.slice(0,200);
    where.OR = [{ title: { contains: qq, mode: 'insensitive' } }, { description: { contains: qq, mode: 'insensitive' } }, { sku: { contains: qq, mode: 'insensitive' } }, { barcode: { contains: qq, mode: 'insensitive' } }];
  }
  if (collection) where.collections = { some: { collection: { slug: String(collection).slice(0,100) } } };
  const products = await prisma.product.findMany({
    where, take, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
    include: { images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }, variants: true, collections: { include: { collection: true } } },
  });
  res.json({ products, nextCursor: products.length === take ? products[products.length - 1].id : null });
}));

// ── Custom field definitions ─────────────────────────────────────────────
// Must stay above GET /:slug so "fields" isn't swallowed by the param route.
// Shared CRUD lives in lib/fieldDefs.js — product list is public (storefront).
registerFieldRoutes(router, { entityType: 'product', roles: ['admin', 'developer'], publicList: true });

router.get('/:slug', asyncHandler(async (req, res) => {
  const slug = String(req.params.slug).slice(0,200);
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Invalid slug', code: 'validation_failed' });
  const product = await prisma.product.findUnique({
    where: { slug, deletedAt: null },
    include: { images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }, variants: true, reviews: { where: { isApproved: true } }, collections: { include: { collection: true } } },
  });
  if (!product) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  // Tracked products without variants hold stock in the default-location
  // InventoryLevel — expose it so the storefront can show/enable Add to Cart.
  if (product.stockMode === 'tracked' && product.variants.length === 0) {
    const loc = await prisma.inventoryLocation.findFirst({ where: { isDefault: true } }) || await prisma.inventoryLocation.findFirst();
    const level = loc ? await prisma.inventoryLevel.findFirst({ where: { productId: product.id, variantId: null, locationId: loc.id } }) : null;
    return res.json({ ...product, availableQty: level ? level.onHand : 0 });
  }
  res.json(product);
}));

// Admin: CRUD — strict, finite, audit
router.post('/', requireAuth, requireRole('admin','developer','maker','staff'), validate(productSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  data.customFields = await validateCustomFields(data.customFields, 'product');
  if (data.customFields === null) data.customFields = Prisma.DbNull; // clear = DB NULL, not JSON 'null'
  try {
    const product = await prisma.product.create({ data: { ...data, price: data.price, compareAtPrice: data.compareAtPrice ?? undefined, cost: data.cost ?? undefined } });
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'product_create', entityType: 'product', entityId: product.id, details: { title: product.title, price: String(product.price) } });
    res.status(201).json(product);
  } catch (e) {
    // Unique barcode/sku collision (DB-level — indexed lookup integrity)
    if (e.code === 'P2002') return res.status(409).json({ error: 'Barcode or SKU already in use', code: 'barcode_taken', details: e.meta?.target });
    throw e;
  }
}));

router.patch('/:id', requireAuth, requireRole('admin','developer','maker','staff'), validate(productPatchSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  if (Object.keys(data).length===0) return res.status(400).json({ error: 'No fields to update', code: 'validation_failed' });
  if (data.customFields !== undefined) data.customFields = await validateCustomFields(data.customFields, 'product');
  if (data.customFields === null) data.customFields = Prisma.DbNull; // clear = DB NULL, not JSON 'null'
  const before = await prisma.product.findUnique({ where: { id: req.params.id }, select: { price: true, title: true } });
  let product;
  try {
    product = await prisma.product.update({ where: { id: req.params.id }, data });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Barcode or SKU already in use', code: 'barcode_taken', details: e.meta?.target });
    throw e;
  }
  if (before && data.price !== undefined && String(before.price) !== String(data.price)) {
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'product_price_update', entityType: 'product', entityId: product.id, details: { from: String(before.price), to: String(data.price) } });
  } else if (before) {
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'product_update', entityType: 'product', entityId: product.id, details: { fields: Object.keys(data) } });
  }
  res.json(product);
}));

// Soft delete — keeps historical OrderLine/CartItem/StockMovement FKs intact.
router.delete('/:id', requireAuth, requireRole('admin','developer'), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0,100);
  const product = await prisma.product.findUnique({ where: { id }, select: { title: true } });
  if (!product) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  await prisma.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'product_delete', entityType: 'product', entityId: id, details: { title: product.title } });
  res.json({ ok: true });
}));

// Product images upload — sharp resize 800x800 → Supabase Storage (prod) or backend/uploads (dev)
const IMAGE_CAP = 12; // per product
const imageUploadLimit = rateLimit('product_images', 60, 5);
const imagePatchSchema = z.object({ alt: z.string().max(200).optional() }).strict();
const imageOrderSchema = z.object({ order: z.array(z.string().min(1).max(100)).min(1).max(50) }).strict();

router.post('/:id/images', requireAuth, requireRole('admin','developer','maker','staff'), imageUploadLimit, upload.array('images', 5), asyncHandler(async (req, res) => {
  const productId = String(req.params.id).slice(0,100);
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return res.status(404).json({ error: 'Product not found', code: 'not_found' });
  if (!req.files || req.files.length===0) return res.status(400).json({ error: 'No images', code: 'validation_failed' });
  const existingCount = await prisma.productImage.count({ where: { productId } });
  if (existingCount + req.files.length > IMAGE_CAP) return res.status(409).json({ error: `Image limit reached (${IMAGE_CAP} per product)`, code: 'image_limit' });
  // Decode everything first so one bad file doesn't leave a half-saved batch
  const processed = [];
  for (const file of req.files) {
    try {
      processed.push({ file, buf: await sharp(file.buffer).rotate().resize(800,800, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer() });
    } catch {
      return res.status(400).json({ error: `"${file.originalname}" is not a readable image`, code: 'invalid_image' });
    }
  }
  const agg = await prisma.productImage.aggregate({ where: { productId }, _max: { sortOrder: true } });
  let seq = (agg._max.sortOrder ?? -1) + 1;
  const created = [];
  for (const { file, buf: resized } of processed) {
    const key = `products/${productId}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.jpg`;
    const url = await putObject(key, resized, 'image/jpeg');
    let img;
    try {
      img = await prisma.productImage.create({ data: { productId, url, alt: file.originalname.slice(0,200), sortOrder: seq } });
    } catch (e) {
      await deleteObjectByUrl(url); // don't leak the object if the row write failed
      throw e;
    }
    created.push(img);
    seq++;
  }
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'product_images_upload', entityType: 'product', entityId: productId, details: { count: created.length, title: product.title } });
  res.status(201).json(created);
}));

// Update a product image (alt text edit from the admin gallery)
router.patch('/:productId/images/:imageId', requireAuth, requireRole('admin','developer','maker','staff'), validate(imagePatchSchema), asyncHandler(async (req, res) => {
  const image = await prisma.productImage.findUnique({ where: { id: String(req.params.imageId).slice(0,100) } });
  if (!image) return res.status(404).json({ error: 'Image not found', code: 'not_found' });
  if (image.productId !== req.params.productId) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  const updated = await prisma.productImage.update({ where: { id: image.id }, data: { alt: req.validated.alt } });
  res.json(updated);
}));

// Reorder gallery — full id list in display order; normalises legacy ties (all sortOrder 0)
router.put('/:productId/images/order', requireAuth, requireRole('admin','developer','maker','staff'), validate(imageOrderSchema), asyncHandler(async (req, res) => {
  const productId = String(req.params.productId).slice(0,100);
  const images = await prisma.productImage.findMany({ where: { productId } });
  const valid = new Set(images.map((i) => i.id));
  const order = req.validated.order;
  if (order.length !== images.length || order.some((id) => !valid.has(id))) {
    return res.status(400).json({ error: 'Order must list every image id of this product exactly once', code: 'invalid_order' });
  }
  await prisma.$transaction(order.map((id, i) => prisma.productImage.update({ where: { id }, data: { sortOrder: i } })));
  res.json({ ok: true });
}));

// Delete a product image (removes file + DB row)
router.delete('/:productId/images/:imageId', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const image = await prisma.productImage.findUnique({ where: { id: String(req.params.imageId).slice(0,100) } });
  if (!image) return res.status(404).json({ error: 'Image not found', code: 'not_found' });
  if (image.productId !== req.params.productId) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  await prisma.productImage.delete({ where: { id: image.id } });
  await deleteObjectByUrl(image.url);
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'product_image_delete', entityType: 'product', entityId: req.params.productId, details: { imageId: image.id } });
  res.json({ ok: true });
}));

// ── Digital template file (Cricut SVG) upload ───────────────────────────────
// Stores into the PRIVATE digital-assets bucket; the key is saved on
// Product.svgUrl and only served via the tokenized GET /api/dl/:token route
// after purchase. Replacing the file updates svgUrl — old emailed tokens keep
// working (same line → same product → new file).
const svgUploadLimit = rateLimit('product_svg', 30, 5);
const SVG_CAP_BYTES = 2 * 1024 * 1024; // 2MB — Cricut SVGs are tiny vector files

router.post('/:id/svg', requireAuth, requireRole('admin','developer','maker','staff'), svgUploadLimit, uploadDocs.single('file'), asyncHandler(async (req, res) => {
  const productId = String(req.params.id).slice(0, 100);
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return res.status(404).json({ error: 'Product not found', code: 'not_found' });
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded — send the SVG as multipart field "file"', code: 'validation_failed' });
  if (file.mimetype !== 'image/svg+xml') return res.status(415).json({ error: 'SVG files only', code: 'unsupported_media_type' });
  if (file.size > SVG_CAP_BYTES) return res.status(413).json({ error: 'SVG too large (2MB max)', code: 'file_too_large' });
  if (!docMimeLooksReal(file.buffer, 'image/svg+xml')) return res.status(400).json({ error: 'File is not a real SVG', code: 'invalid_file' });
  const key = `${productId}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.svg`;
  // putObject returns "digital-assets/<key>" for private buckets
  const ref = await putObject(key, file.buffer, 'image/svg+xml', { bucket: 'digital-assets' });
  const previous = product.svgUrl;
  const updated = await prisma.product.update({ where: { id: productId }, data: { svgUrl: ref } });
  if (previous && previous !== ref) deleteObjectByUrl(previous).catch(() => {});
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'product_svg_upload', entityType: 'product', entityId: productId, details: { title: product.title, bytes: file.size } });
  res.status(201).json({ svgUrl: updated.svgUrl, product: updated });
}));

export default router;
