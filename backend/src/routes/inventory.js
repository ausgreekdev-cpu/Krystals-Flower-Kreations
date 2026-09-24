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

router.get('/movements', asyncHandler(async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 30));
  const movements = await prisma.stockMovement.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { product: { select: { title: true } }, rawMaterial: { select: { name: true } }, location: { select: { name: true } }, user: { select: { email: true } } },
  });
  res.json(movements);
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

// Reconciliation: compare InventoryLevel.onHand vs sum(InventoryLedger.delta) per variant
router.get('/reconciliation', asyncHandler(async (req, res) => {
  const variants = await prisma.productVariant.findMany({ select: { id: true, title: true, inventoryQuantity: true, product: { select: { title: true } } }, take: 100 });
  const ledgerSums = await prisma.inventoryLedger.groupBy({ by: ['variantId'], _sum: { delta: true } });
  const ledgerMap = Object.fromEntries(ledgerSums.map(l=> [l.variantId, l._sum.delta||0]));
  const rows = variants.map(v=> {
    const ledgerTotal = ledgerMap[v.id]||0;
    const drift = v.inventoryQuantity - ledgerTotal;
    return { variantId: v.id, title: v.title, product: v.product.title, inventoryQuantity: v.inventoryQuantity, ledgerTotal, drift, ok: drift===0 };
  });
  res.json(rows);
}));

export default router;
