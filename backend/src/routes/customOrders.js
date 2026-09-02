import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
const customOrderLimit = rateLimit('custom_order_create', 10, 1);
const requireAuth = authenticate;

const STATE_ORDER = ['drafting_proofing','cricut_cutting','hand_folding_assembly','quality_check','dispatched_pickup_ready'];

function nextState(current, target) {
  if (target === 'cancelled') return true;
  const ci = STATE_ORDER.indexOf(current);
  const ti = STATE_ORDER.indexOf(target);
  return ti === ci + 1 || ti === ci;
}
function orderNumber() {
  return `KFK-CA-${new Date().getFullYear()}-${Math.random().toString(36).toUpperCase().slice(2,6)}${Date.now().toString().slice(-3)}`;
}
const specSchema = z.object({
  paperColor: z.string().min(1).max(50),
  paperTexture: z.string().min(1).max(50),
  weight: z.string().min(1).max(20),
  stemCount: z.number().int().finite().min(1).max(25),
  armatureHeightMm: z.number().int().finite().min(50).max(800),
  templateId: z.string().min(1).max(100),
  addGreenery: z.boolean().default(false),
  vaseIncluded: z.boolean().default(false),
  notes: z.string().max(2000).optional().nullable(),
});
const createSchema = z.object({
  customerEmail: z.string().email().max(254),
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().max(30).optional().nullable(),
  productId: z.string().min(8).max(100).optional().nullable(),
  variantId: z.string().min(8).max(100).optional().nullable(),
  spec: specSchema,
  shippingName: z.string().max(120).optional().nullable(),
  shippingAddress: z.string().max(500).optional().nullable(),
  shippingSuburb: z.string().max(100).optional().nullable(),
  shippingState: z.string().max(50).default('WA'),
  shippingPostcode: z.string().max(10).optional().nullable(),
}).strict();

router.post('/', customOrderLimit, validate(createSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  const idempotencyKey = req.headers['idempotency-key'] ? String(req.headers['idempotency-key']).slice(0,100) : null;
  if (idempotencyKey) {
    const existing = await prisma.customArtOrder.findUnique({ where: { idempotencyKey }, include: { history: true, ticket: true } });
    if (existing) return res.json(existing);
  }
  let recipe = null;
  if (data.variantId) recipe = await prisma.bOMRecipe.findFirst({ where: { variantId: data.variantId }, include: { lines: { include: { rawMaterial: true } } } });
  if (!recipe && data.productId) recipe = await prisma.bOMRecipe.findFirst({ where: { productId: data.productId, variantId: null }, include: { lines: { include: { rawMaterial: true } } } });
  if (!recipe) recipe = await prisma.bOMRecipe.findFirst({ include: { lines: { include: { rawMaterial: true } } } });
  const stemCount = data.spec.stemCount;
  let bomSnapshot = [];
  let costPrice = 0;
  let estimatedMinutes = 0;
  if (recipe) {
    const baseline = 7;
    const scale = stemCount / baseline;
    for (const l of recipe.lines) {
      const eff = l.qtyPerUnit * (1 + l.wasteFactor) * scale;
      const cost = eff * l.rawMaterial.costPerUnit;
      bomSnapshot.push({ rawMaterialId: l.rawMaterialId, sku: l.rawMaterial.sku, effectiveQty: eff, cost });
      costPrice += cost;
    }
    estimatedMinutes = Math.round((recipe.labourMinutesPerUnit + recipe.cricutMinutesPerUnit) * scale);
    if (data.spec.vaseIncluded) estimatedMinutes += 8;
    if (data.spec.addGreenery) estimatedMinutes += 5;
  } else {
    estimatedMinutes = Math.round(22 + stemCount * 6 + (data.spec.armatureHeightMm / 60));
  }
  const LABOUR_RATE = 55 / 60;
  const rawPrice = costPrice + (estimatedMinutes * LABOUR_RATE);
  const totalPrice = Math.round((rawPrice * 1.30) * 100) / 100 + (data.spec.vaseIncluded ? 22 : 0) + (data.spec.addGreenery ? 12 : 0);
  const finalPrice = Math.max(45 + stemCount * 9.5, totalPrice);
  const order = await prisma.customArtOrder.create({
    data: {
      orderNumber: orderNumber(),
      idempotencyKey: idempotencyKey || undefined,
      customerEmail: data.customerEmail,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      productId: data.productId || null,
      variantId: data.variantId || null,
      spec: data.spec,
      state: 'drafting_proofing',
      bomSnapshot,
      estimatedMinutes,
      totalPrice: Math.round(finalPrice * 100) / 100,
      costPrice: Math.round(costPrice * 100) / 100,
      shippingName: data.shippingName,
      shippingAddress: data.shippingAddress,
      shippingSuburb: data.shippingSuburb,
      shippingState: data.shippingState,
      shippingPostcode: data.shippingPostcode,
    },
  });
  const qrPayload = `KFK-T-CA-${order.orderNumber}-${randomUUID().slice(0,8).toUpperCase()}`;
  await prisma.ticket.create({ data: { customArtOrderId: order.id, qrPayload, qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrPayload)}` } });
  await prisma.customArtOrderHistory.create({ data: { orderId: order.id, toState: 'drafting_proofing', note: 'Created from configurator' } });
  const full = await prisma.customArtOrder.findUnique({ where: { id: order.id }, include: { history: true, ticket: true } });
  res.status(201).json(full);
}));

router.get('/', authenticate, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const { state } = req.query;
  const where = state ? { state: String(state) } : {};
  const orders = await prisma.customArtOrder.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, include: { history: true, ticket: true, product: { select: { title: true } } } });
  res.json(orders);
}));

router.get('/kanban', authenticate, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const counts = await prisma.customArtOrder.groupBy({ by: ['state'], _count: true, _sum: { totalPrice: true }, where: { state: { not: 'cancelled' } } });
  res.json(counts);
}));

router.get('/by-number/:orderNumber', authenticate, asyncHandler(async (req, res) => {
  const orderNumber = String(req.params.orderNumber).slice(0,50);
  const order = await prisma.customArtOrder.findUnique({ where: { orderNumber }, include: { history: true, ticket: true } });
  if (!order) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const isStaff = ['admin','developer','maker','staff'].includes(req.user.role);
  if (!isStaff && order.customerEmail !== req.user.email) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  res.json(order);
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0,100);
  const order = await prisma.customArtOrder.findUnique({ where: { id }, include: { history: true, ticket: true, product: { include: { images: true } } } });
  if (!order) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const isStaff = ['admin','developer','maker','staff'].includes(req.user.role);
  if (!isStaff && order.customerEmail !== req.user.email) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  res.json(order);
}));

router.patch('/:id/state', authenticate, requireRole('admin','developer','maker'), asyncHandler(async (req, res) => {
  const { state, note } = req.body;
  const valid = ['drafting_proofing','cricut_cutting','hand_folding_assembly','quality_check','dispatched_pickup_ready','cancelled'];
  if (!valid.includes(state)) return res.status(400).json({ error: 'Invalid state', code: 'validation_failed' });
  const order = await prisma.customArtOrder.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  if (!nextState(order.state, state)) return res.status(409).json({ error: `Cannot move ${order.state} → ${state}`, code: 'conflict' });
  if (order.state === 'drafting_proofing' && state === 'cricut_cutting') {
    for (const line of (order.bomSnapshot || [])) {
      try {
        await prisma.rawMaterial.update({ where: { id: line.rawMaterialId }, data: { onHand: { decrement: line.effectiveQty } } });
        await prisma.stockMovement.create({ data: { productId: order.productId || 'custom', rawMaterialId: line.rawMaterialId, type: 'bom_deduct', quantity: -Math.round(line.effectiveQty), reason: `Custom order ${order.orderNumber} → Cricut Cutting`, reference: order.id, userId: req.user.id } });
      } catch {}
    }
  }
  const updated = await prisma.customArtOrder.update({ where: { id: order.id }, data: { state, ...(state === 'dispatched_pickup_ready' ? { dispatchedAt: new Date() } : {}) } });
  await prisma.customArtOrderHistory.create({ data: { orderId: order.id, fromState: order.state, toState: state, note: note ? String(note).slice(0,500) : null, byUserId: req.user.id } });
  res.json(updated);
}));

export default router;
