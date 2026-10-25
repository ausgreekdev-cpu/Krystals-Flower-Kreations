import { Router } from 'express';
import { z } from 'zod';
import { randomUUID, randomBytes } from 'node:crypto';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { sendCustomOrderConfirmation, sendAdminCustomOrderAlert } from '../services/email.js';
import { quoteCustomOrder } from '../services/customOrderPricing.js';
import { handleCustomOrderStateChange } from '../lib/customOrderState.js';
import { ALLOWED_PAPER_COLORS, ALLOWED_PAPER_TEXTURES, ALLOWED_WEIGHTS, ALLOWED_TEMPLATES } from '../../../shared/configurator.js';
import { getSettings } from '../lib/settingsSchema.js';

const router = Router();
const customOrderLimit = rateLimit('custom_order_create', 10, 1);

function orderNumber() {
  return `KFK-CA-${new Date().getFullYear()}-${Math.random().toString(36).toUpperCase().slice(2,6)}${Date.now().toString().slice(-3)}`;
}
export const specSchema = z.object({
  paperColor: z.enum(ALLOWED_PAPER_COLORS),
  paperTexture: z.enum(ALLOWED_PAPER_TEXTURES),
  weight: z.enum(ALLOWED_WEIGHTS),
  stemCount: z.number().int().finite().min(1).max(25),
  heightMm: z.number().int().finite().min(50).max(800),
  templateId: z.enum(ALLOWED_TEMPLATES),
  addGreenery: z.boolean().default(false),
  vaseIncluded: z.boolean().default(false),
  domeIncluded: z.boolean().default(false),
  ledIncluded: z.boolean().default(false),
  palette: z.string().min(1).max(50).optional().nullable(),
  paperStockId: z.string().min(8).max(100).optional().nullable(),
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
  neededBy: z.coerce.date().optional().nullable(),
  fulfilment: z.enum(['pickup','post']).default('pickup'),
}).strict();

router.post('/', customOrderLimit, validate(createSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  const idempotencyKey = req.headers['idempotency-key'] ? String(req.headers['idempotency-key']).slice(0,100) : null;
  if (idempotencyKey) {
    const existing = await prisma.customArtOrder.findUnique({ where: { idempotencyKey }, include: { history: true, ticket: true } });
    if (existing) return res.json(existing);
  }
  const quoted = await quoteCustomOrder(data.spec);
  const statusToken = randomBytes(32).toString('hex');
  const neededBy = data.neededBy ? new Date(data.neededBy) : null;
  const fulfilment = data.fulfilment || 'pickup';
  // Lead time check
  let leadNote = null;
  if (neededBy) {
    const S = await getSettings({ onlyPublic: true }).catch(()=>({}));
    const leadDays = Number(S.custom_order_lead_days) || 7;
    const leadDate = new Date(); leadDate.setDate(leadDate.getDate() + leadDays);
    leadDate.setHours(0,0,0,0);
    const needed = new Date(neededBy); needed.setHours(0,0,0,0);
    if (needed < leadDate) leadNote = 'Needed inside standard lead time - confirm feasibility';
  }
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
      bomSnapshot: quoted.bomSnapshot,
      estimatedMinutes: quoted.estimatedMinutes,
      totalPrice: quoted.total,
      costPrice: quoted.costPrice,
      shippingName: data.shippingName,
      shippingAddress: data.shippingAddress,
      shippingSuburb: data.shippingSuburb,
      shippingState: data.shippingState,
      shippingPostcode: data.shippingPostcode,
      neededBy,
      fulfilment,
      statusToken,
    },
  });
  const qrPayload = `KFK-T-CA-${order.orderNumber}-${randomUUID().slice(0,8).toUpperCase()}`;
  await prisma.ticket.create({ data: { customArtOrderId: order.id, qrPayload, qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrPayload)}` } });
  let historyNote = 'Created from configurator';
  if (!quoted.bomSnapshot || quoted.bomSnapshot.length === 0) {
    historyNote = `No BOM recipe for ${data.spec.templateId}`;
  }
  if (leadNote) historyNote = historyNote + `; ${leadNote}`;
  await prisma.customArtOrderHistory.create({ data: { orderId: order.id, toState: 'drafting_proofing', note: historyNote } });
  const full = await prisma.customArtOrder.findUnique({ where: { id: order.id }, include: { history: true, ticket: true } });
  await sendCustomOrderConfirmation(full).catch(()=>{});
  await sendAdminCustomOrderAlert(full).catch(()=>{});
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

const statusLimit = rateLimit('custom_order_status', 60, 1);
const STATUS_LABELS = {
  drafting_proofing: 'Drafting / Proofing',
  cricut_cutting: 'Cutting',
  hand_folding_assembly: 'Hand Folding & Assembly',
  quality_check: 'Quality Check',
  dispatched_pickup_ready: 'Dispatched / Pickup Ready',
  cancelled: 'Cancelled',
};

router.get('/status/:token', statusLimit, asyncHandler(async (req, res) => {
  const token = String(req.params.token).slice(0, 128);
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const order = await prisma.customArtOrder.findUnique({ where: { statusToken: token }, select: { orderNumber: true, state: true, neededBy: true, fulfilment: true, paymentStatus: true, totalPrice: true } });
  if (!order) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  res.json({
    orderNumber: order.orderNumber,
    state: order.state,
    stateLabel: STATUS_LABELS[order.state] || order.state,
    neededBy: order.neededBy,
    fulfilment: order.fulfilment,
    paymentStatus: order.paymentStatus,
    total: order.totalPrice,
  });
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
  const updated = await handleCustomOrderStateChange({ orderId: req.params.id, targetState: state, note, actorId: req.user.id });
  res.json(updated);
}));

router.patch('/:id/proof', authenticate, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const { approved } = req.body;
  const order = await prisma.customArtOrder.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const updated = await prisma.customArtOrder.update({ where: { id: order.id }, data: { proofApprovedAt: approved ? new Date() : null } });
  await prisma.customArtOrderHistory.create({ data: { orderId: order.id, fromState: order.state, toState: order.state, note: approved ? 'Proof approved' : 'Proof reset', byUserId: req.user.id } });
  res.json(updated);
}));

router.patch('/:id/payment', authenticate, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const { paymentStatus } = req.body;
  const allowed = ['unpaid','deposit_paid','paid'];
  if (!allowed.includes(paymentStatus)) return res.status(400).json({ error: 'Invalid paymentStatus', code: 'validation_failed' });
  const order = await prisma.customArtOrder.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const updated = await prisma.customArtOrder.update({ where: { id: order.id }, data: { paymentStatus } });
  await prisma.customArtOrderHistory.create({ data: { orderId: order.id, fromState: order.state, toState: order.state, note: `Payment: ${paymentStatus}`, byUserId: req.user.id } });
  res.json(updated);
}));

export default router;
