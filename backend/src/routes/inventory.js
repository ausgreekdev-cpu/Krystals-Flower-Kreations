import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { rateLimit } from '../middleware/rate-limit.js';

const router = Router();
const requireAuth = authenticate;
router.use(requireAuth, requireRole('admin','developer','maker','staff')); 
const adjustLimit = rateLimit('inventory_adjust', 20, 1);

router.get('/levels', asyncHandler(async (req, res) => {
  const levels = await prisma.inventoryLevel.findMany({ include: { product: { include: { images: true } }, variant: true, location: true } });
  res.json(levels);
}));

const adjustSchema = z.object({
  productId: z.string().min(8).max(100),
  variantId: z.string().min(8).max(100).optional().nullable(),
  locationId: z.string().min(8).max(100),
  quantity: z.number().int().finite().min(-1000).max(1000),
  reason: z.string().max(500).optional(),
}).strict();

router.post('/adjust', adjustLimit, validate(adjustSchema), asyncHandler(async (req, res) => {
  const { productId, variantId, locationId, quantity, reason } = req.validated;
  if (!Number.isFinite(quantity) || quantity===0) return res.status(400).json({ error: 'quantity must be finite non-zero', code: 'validation_failed' });
  // Prisma upsert rejects null on the @@unique nullable variantId member.
  const vId = variantId || null;
  const existing = await prisma.inventoryLevel.findFirst({ where: { productId, variantId: vId, locationId } });
  const level = existing
    ? await prisma.inventoryLevel.update({ where: { id: existing.id }, data: { onHand: { increment: quantity } } })
    : await prisma.inventoryLevel.create({ data: { productId, variantId: vId, locationId, onHand: quantity } });
  await prisma.stockMovement.create({ data: { productId, variantId: vId, locationId, type: quantity >= 0 ? 'in' : 'out', quantity, reason: reason?.slice(0,500), userId: req.user.id } });
  // also update variant inventoryQuantity atomically
  if (variantId) {
    await prisma.productVariant.update({ where: { id: variantId }, data: { inventoryQuantity: { increment: quantity } } }).catch(()=>{});
    await prisma.inventoryLedger.create({ data: { variantId, delta: quantity, reason: 'adjustment', userId: req.user.id } }).catch(()=>{});
  }
  res.json(level);
}));

router.get('/low-stock', asyncHandler(async (req, res) => {
  const defaultThreshold = Number((await prisma.setting.findUnique({ where: { key: 'low_stock_default' } }))?.value || 5);
  const [levels, materials, variants] = await Promise.all([
    prisma.inventoryLevel.findMany({ where: { variantId: null }, include: { product: { select: { title: true } }, location: { select: { name: true } } } }),
    prisma.rawMaterial.findMany(),
    prisma.productVariant.findMany({ include: { product: { select: { title: true } } } }),
  ]);
  const low = [];
  for (const l of levels) {
    const threshold = l.lowStockThreshold ?? defaultThreshold;
    if (l.onHand <= threshold) low.push({ type: 'product', id: l.id, name: l.product?.title || l.productId, location: l.location?.name, onHand: l.onHand, threshold, sku: null });
  }
  for (const m of materials) {
    if (Number(m.onHand) <= Number(m.lowThreshold)) low.push({ type: 'material', id: m.id, name: m.name, location: '—', onHand: Number(m.onHand), threshold: Number(m.lowThreshold), sku: m.sku });
  }
  for (const v of variants) {
    if (v.inventoryQuantity <= defaultThreshold) low.push({ type: 'variant', id: v.id, name: `${v.product?.title} — ${v.title}`, location: '—', onHand: v.inventoryQuantity, threshold: defaultThreshold, sku: v.sku });
  }
  res.json(low);
}));

// Set a product-level low-stock threshold (null clears to default)
router.post('/threshold', validate(z.object({ levelId: z.string().min(8).max(100), lowStockThreshold: z.number().int().finite().min(0).max(100000).nullable().optional() }).strict()), asyncHandler(async (req, res) => {
  const { levelId, lowStockThreshold } = req.validated;
  const level = await prisma.inventoryLevel.update({ where: { id: levelId }, data: { lowStockThreshold: lowStockThreshold ?? null } });
  res.json(level);
}));

router.get('/movements', asyncHandler(async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 30));
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const { type, productId, locationId, from, to } = req.query;
  const where = {};
  if (type) where.type = String(type).slice(0,50);
  if (productId) where.OR = [{ productId: String(productId).slice(0,100) }, { rawMaterialId: String(productId).slice(0,100) }, { variantId: String(productId).slice(0,100) }];
  if (locationId) where.locationId = String(locationId).slice(0,100);
  if (from) {
    const d = new Date(String(from));
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid from date', code: 'validation_failed' });
    where.createdAt = { gte: d };
  }
  if (to) {
    const d = new Date(String(to));
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid to date', code: 'validation_failed' });
    where.createdAt = { ...(where.createdAt || {}), lte: d };
  }
  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      include: { product: { select: { title: true } }, rawMaterial: { select: { name: true } }, location: { select: { name: true } }, user: { select: { email: true } } },
    }),
    prisma.stockMovement.count({ where }),
  ]);
  res.json({ data: movements, total, page, limit, pages: Math.ceil(total / limit) });
}));

// Exact-set onHand (vs increment-only /adjust). Writes stockMovement + variant inventoryQuantity.
const setSchema = z.object({
  productId: z.string().min(8).max(100),
  variantId: z.string().min(8).max(100).optional().nullable(),
  locationId: z.string().min(8).max(100),
  onHand: z.number().int().finite().min(0).max(1000000),
  reason: z.string().max(500).optional(),
}).strict();
router.post('/set', adjustLimit, validate(setSchema), asyncHandler(async (req, res) => {
  const { productId, variantId, locationId, onHand, reason } = req.validated;
  const vId = variantId || null;
  const existing = await prisma.inventoryLevel.findFirst({ where: { productId, variantId: vId, locationId } });
  const before = existing?.onHand ?? 0;
  const delta = onHand - before;
  const level = existing
    ? await prisma.inventoryLevel.update({ where: { id: existing.id }, data: { onHand } })
    : await prisma.inventoryLevel.create({ data: { productId, variantId: vId, locationId, onHand } });
  if (delta !== 0) {
    await prisma.stockMovement.create({ data: { productId, variantId: vId, locationId, type: delta > 0 ? 'in' : 'out', quantity: delta, reason: `Set to ${onHand}${reason ? ` — ${reason}` : ''}`, userId: req.user.id } });
  }
  if (variantId && delta !== 0) {
    await prisma.productVariant.update({ where: { id: variantId }, data: { inventoryQuantity: { increment: delta } } }).catch(()=>{});
    await prisma.inventoryLedger.create({ data: { variantId, delta, reason: 'set', userId: req.user.id } }).catch(()=>{});
  }
  res.json(level);
}));

router.get('/locations', asyncHandler(async (req, res) => {
  const locs = await prisma.inventoryLocation.findMany();
  res.json(locs);
}));

const locationSchema = z.object({ name: z.string().min(2).max(100), address: z.string().max(500).optional().nullable(), isDefault: z.boolean().optional(), isActive: z.boolean().optional() }).strict();
router.post('/locations', validate(locationSchema), asyncHandler(async (req, res) => {
  const loc = await prisma.inventoryLocation.create({ data: req.validated });
  res.status(201).json(loc);
}));

router.patch('/locations/:id', validate(locationSchema.partial()), asyncHandler(async (req, res) => {
  const loc = await prisma.inventoryLocation.update({ where: { id: String(req.params.id).slice(0,100) }, data: req.validated });
  res.json(loc);
}));

router.delete('/locations/:id', requireAuth, requireRole('admin','developer'), asyncHandler(async (req, res) => {
  await prisma.inventoryLocation.delete({ where: { id: String(req.params.id).slice(0,100) } });
  res.json({ ok: true });
}));

// Reconciliation: compare actual onHand (variants + product levels + raw materials) vs ledger/movement sums
router.get('/reconciliation', asyncHandler(async (req, res) => {
  const [variants, levels, materials] = await Promise.all([
    prisma.productVariant.findMany({ select: { id: true, title: true, inventoryQuantity: true, product: { select: { title: true } } }, take: 500 }),
    prisma.inventoryLevel.findMany({ where: { variantId: null }, include: { product: { select: { title: true } } }, take: 500 }),
    prisma.rawMaterial.findMany({ select: { id: true, name: true, onHand: true, sku: true } }),
  ]);
  const ledgerSums = await prisma.inventoryLedger.groupBy({ by: ['variantId'], _sum: { delta: true } });
  const ledgerMap = Object.fromEntries(ledgerSums.map(l=> [l.variantId, l._sum.delta||0]));
  const movementByProduct = await prisma.stockMovement.groupBy({ by: ['productId'], _sum: { quantity: true }, where: { productId: { not: null }, type: { not: 'stocktake' } } });
  const productMovementMap = Object.fromEntries(movementByProduct.map(m => [m.productId, m._sum.quantity || 0]));
  const rows = [
    ...variants.map(v=> {
      const ledgerTotal = ledgerMap[v.id]||0;
      const drift = v.inventoryQuantity - ledgerTotal;
      return { kind: 'variant', key: v.id, title: `${v.product.title} — ${v.title}`, actual: v.inventoryQuantity, recorded: ledgerTotal, drift, ok: drift===0 };
    }),
    ...levels.map(l=> {
      const recorded = productMovementMap[l.productId] || 0;
      const drift = l.onHand - recorded;
      return { kind: 'product', key: l.id, title: l.product?.title || l.productId, actual: l.onHand, recorded, drift, ok: drift===0 };
    }),
    ...materials.map(m=> {
      const recorded = productMovementMap[m.id] || 0;
      const drift = Number(m.onHand) - recorded;
      return { kind: 'material', key: m.id, title: m.name, actual: Number(m.onHand), recorded, drift, ok: drift===0 };
    }),
  ];
  res.json(rows);
}));

// Stocktake: submit counted quantities; compute variance; persist record + stocktake movements
const stocktakeLineSchema = z.object({
  productId: z.string().min(8).max(100).optional().nullable(),
  variantId: z.string().min(8).max(100).optional().nullable(),
  rawMaterialId: z.string().min(8).max(100).optional().nullable(),
  countedQty: z.number().int().finite().min(0).max(1000000),
}).refine((l) => l.productId || l.rawMaterialId, { message: 'Each line needs productId or rawMaterialId' });
const stocktakeSchema = z.object({
  locationId: z.string().min(8).max(100),
  notes: z.string().max(2000).optional().nullable(),
  items: z.array(stocktakeLineSchema).min(1).max(500),
}).strict();
router.post('/stocktake', validate(stocktakeSchema), asyncHandler(async (req, res) => {
  const { locationId, notes, items } = req.validated;
  const lines = [];
  for (const it of items) {
    if (!it.productId && !it.rawMaterialId) continue;
    const vId = it.variantId || null;
    let expected = 0;
    if (it.rawMaterialId) {
      const m = await prisma.rawMaterial.findUnique({ where: { id: it.rawMaterialId } });
      if (m) expected = Math.round(Number(m.onHand));
    } else {
      const level = await prisma.inventoryLevel.findFirst({ where: { productId: it.productId, variantId: vId, locationId } });
      expected = level?.onHand ?? 0;
    }
    const counted = Math.max(0, Math.round(Number(it.countedQty) || 0));
    lines.push({ ...it, variantId: vId, expectedQty: expected, countedQty: counted, variance: counted - expected });
  }
  if (!lines.length) return res.status(400).json({ error: 'No valid lines', code: 'validation_failed' });  const stocktake = await prisma.$transaction(async (tx) => {
    const st = await tx.stocktake.create({ data: { locationId, notes: notes ? String(notes).slice(0,2000) : null, countedBy: req.user.id, status: 'completed', completedAt: new Date(), lines: { create: lines.map(l => ({ productId: l.productId || null, variantId: l.variantId || null, rawMaterialId: l.rawMaterialId || null, expectedQty: l.expectedQty, countedQty: l.countedQty, variance: l.variance })) } } });
    for (const l of lines) {
      const delta = l.variance;
      if (delta === 0) continue;
      if (l.rawMaterialId) {
        await tx.rawMaterial.update({ where: { id: l.rawMaterialId }, data: { onHand: l.countedQty } });
      } else {
        const vId = l.variantId || null;
        const level = await tx.inventoryLevel.findFirst({ where: { productId: l.productId, variantId: vId, locationId } });
        if (level) await tx.inventoryLevel.update({ where: { id: level.id }, data: { onHand: l.countedQty } });
        else await tx.inventoryLevel.create({ data: { productId: l.productId, variantId: vId, locationId, onHand: l.countedQty } });
        if (vId) await tx.productVariant.update({ where: { id: vId }, data: { inventoryQuantity: l.countedQty } });
      }
      await tx.stockMovement.create({ data: { productId: l.productId || null, variantId: l.variantId || null, rawMaterialId: l.rawMaterialId || null, locationId, type: 'stocktake', quantity: delta, reason: `Stocktake variance (expected ${l.expectedQty}, counted ${l.countedQty})`, reference: st.id, userId: req.user.id } });
    }
    return st;
  });
  res.status(201).json(stocktake);
}));

router.get('/stocktakes', asyncHandler(async (req, res) => {
  const stocktakes = await prisma.stocktake.findMany({ orderBy: { createdAt: 'desc' }, take: 30, include: { location: { select: { name: true } }, _count: { select: { lines: true } } } });
  res.json(stocktakes);
}));

router.get('/stocktakes/:id', asyncHandler(async (req, res) => {
  const st = await prisma.stocktake.findUnique({ where: { id: String(req.params.id).slice(0,100) }, include: { location: { select: { name: true } }, lines: { include: { product: { select: { title: true } }, variant: { select: { title: true } }, rawMaterial: { select: { name: true } } } } } });
  if (!st) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  res.json(st);
}));

// Transfer qty between locations (atomic out + in with shared reference)
const transferSchema = z.object({
  productId: z.string().min(8).max(100).optional().nullable(),
  variantId: z.string().min(8).max(100).optional().nullable(),
  rawMaterialId: z.string().min(8).max(100).optional().nullable(),
  fromLocationId: z.string().min(8).max(100),
  toLocationId: z.string().min(8).max(100),
  quantity: z.number().int().finite().min(1).max(1000000),
}).refine((t) => t.productId || t.rawMaterialId, { message: 'productId or rawMaterialId required' }).refine((t) => t.fromLocationId !== t.toLocationId, { message: 'from and to must differ' });
router.post('/transfer', validate(transferSchema), asyncHandler(async (req, res) => {
  const { productId, variantId, rawMaterialId, fromLocationId, toLocationId, quantity } = req.validated;
  const qty = quantity;
  const ref = `TRF-${Date.now()}`;
  const vId = variantId || null;
  await prisma.$transaction(async (tx) => {
    if (rawMaterialId) {
      const m = await tx.rawMaterial.findUnique({ where: { id: rawMaterialId } });
      if (!m || Number(m.onHand) < qty) throw Object.assign(new Error('Insufficient stock at source'), { status: 422, code: 'out_of_stock' });
      await tx.rawMaterial.update({ where: { id: rawMaterialId }, data: { onHand: { decrement: qty } } });
      await tx.stockMovement.create({ data: { rawMaterialId, locationId: fromLocationId, type: 'transfer', quantity: -qty, reason: `Transfer to ${toLocationId}`, reference: ref, userId: req.user.id } });
    } else {
      const src = await tx.inventoryLevel.findFirst({ where: { productId, variantId: vId, locationId: fromLocationId } });
      if (!src || src.onHand < qty) throw Object.assign(new Error('Insufficient stock at source'), { status: 422, code: 'out_of_stock' });
      await tx.inventoryLevel.update({ where: { id: src.id }, data: { onHand: { decrement: qty } } });
      await tx.stockMovement.create({ data: { productId, variantId: vId, locationId: fromLocationId, type: 'transfer', quantity: -qty, reason: `Transfer to ${toLocationId}`, reference: ref, userId: req.user.id } });
      const dst = await tx.inventoryLevel.findFirst({ where: { productId, variantId: vId, locationId: toLocationId } });
      if (dst) await tx.inventoryLevel.update({ where: { id: dst.id }, data: { onHand: { increment: qty } } });
      else await tx.inventoryLevel.create({ data: { productId, variantId: vId, locationId: toLocationId, onHand: qty } });
    }
    await tx.stockMovement.create({ data: { productId: productId || null, variantId: vId || null, rawMaterialId: rawMaterialId || null, locationId: toLocationId, type: 'transfer', quantity: qty, reason: `Transfer from ${fromLocationId}`, reference: ref, userId: req.user.id } });
  });
  res.json({ ok: true, reference: ref });
}));

// Lots: list + create (receive into a lot) + expiry check
router.get('/lots', asyncHandler(async (req, res) => {
  const lots = await prisma.inventoryLot.findMany({ orderBy: { receivedAt: 'desc' }, take: 100, include: { product: { select: { title: true } }, variant: { select: { title: true } }, rawMaterial: { select: { name: true } }, location: { select: { name: true } } } });
  res.json(lots);
}));

router.post('/lots', validate(z.object({
  productId: z.string().min(8).max(100).optional().nullable(), variantId: z.string().min(8).max(100).optional().nullable(),
  rawMaterialId: z.string().min(8).max(100).optional().nullable(), locationId: z.string().min(8).max(100), lotNumber: z.string().max(100).optional().nullable(),
  quantity: z.number().int().finite().min(1).max(1000000), costPerUnit: z.number().finite().nonnegative().max(1000000).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
}).strict()), asyncHandler(async (req, res) => {
  const d = req.validated;
  const lot = await prisma.inventoryLot.create({ data: { ...d, quantity: d.quantity, remainingQty: d.quantity, costPerUnit: d.costPerUnit ?? undefined, expiresAt: d.expiresAt ? new Date(d.expiresAt) : undefined } });
  res.status(201).json(lot);
}));

router.get('/expiring', asyncHandler(async (req, res) => {
  const soon = new Date(Date.now() + 14 * 86400000);
  const lots = await prisma.inventoryLot.findMany({ where: { expiresAt: { not: null, lte: soon }, remainingQty: { gt: 0 } }, orderBy: { expiresAt: 'asc' }, include: { product: { select: { title: true } }, variant: { select: { title: true } }, rawMaterial: { select: { name: true } } } });
  res.json(lots);
}));

export default router;
