import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { earnForOrder } from '../services/loyaltyService.js';
import { getSettings } from '../lib/settingsSchema.js';

const router = Router();
const requireAuth = authenticate;
router.use(requireAuth, requireRole('admin','developer','maker','staff'));
const posLimit = rateLimit('pos_sale', 30, 1);

const openSchema = z.object({ location: z.string().max(100).optional(), openingCash: z.number().finite().nonnegative().max(10000).optional() }).strict();
router.post('/session/open', validate(openSchema), asyncHandler(async (req, res) => {
  const { location, openingCash } = req.validated;
  // Opening cash omitted → apply the admin-configured default till float
  let float = openingCash;
  if (float === undefined) {
    const S = await getSettings();
    const parsed = Number(S.pos_till_float_default);
    float = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
  const session = await prisma.posSession.create({ data: { openedBy: req.user.id, location: location || 'Perth Studio', openingCash: float } });
  res.status(201).json(session);
}));

router.get('/session/current', asyncHandler(async (req, res) => {
  const session = await prisma.posSession.findFirst({ where: { status: 'open' }, orderBy: { openedAt: 'desc' }, include: { payments: true } });
  res.json(session);
}));

const closeSchema = z.object({ closingCash: z.number().finite().nonnegative().max(100000) }).strict();
router.post('/session/:id/close', validate(closeSchema), asyncHandler(async (req, res) => {
  const { closingCash } = req.validated;
  const session = await prisma.posSession.findUnique({ where: { id: req.params.id }, include: { payments: true } });
  if (!session) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const cashPayments = session.payments.filter(p => p.method === 'cash').reduce((a,b)=> a + Number(b.amount), 0);
  const expectedCash = Number(session.openingCash) + cashPayments;
  const variance = Number(closingCash) - expectedCash;
  const updated = await prisma.posSession.update({ where: { id: session.id }, data: { closedAt: new Date(), closingCash, expectedCash, variance, status: 'closed' } });
  res.json(updated);
}));

// POS sale — atomic: order + ledger + stock, supports offline Idempotency-Key
const saleSchema = z.object({
  sessionId: z.string().min(8).max(100).optional().nullable(),
  items: z.array(z.object({ productId: z.string().min(8).max(100), variantId: z.string().min(8).max(100).optional().nullable(), quantity: z.number().int().finite().min(1).max(99) })).min(1).max(20),
  paymentMethod: z.enum(['cash','eftpos','bank_transfer']).default('cash'),
  email: z.string().email().max(254).default('pos@krystal.local'),
  shippingName: z.string().max(120).default('POS Sale'),
}).strict();
router.post('/sale', posLimit, validate(saleSchema), asyncHandler(async (req, res) => {
  const { sessionId, items, paymentMethod, email, shippingName } = req.validated;
  // Idempotency for offline queue: clientInvoiceId via header
  const idempotencyKey = req.headers['idempotency-key'] ? String(req.headers['idempotency-key']).slice(0,100) : null;
  if (idempotencyKey) {
    const existing = await prisma.order.findUnique({ where: { idempotencyKey } });
    if (existing) return res.json(existing);
  }
  // items: [{ productId, variantId, quantity }]
  let subtotal = 0;
  const enriched = [];
  for (const it of items) {
    const product = await prisma.product.findUnique({ where: { id: it.productId }, include: { variants: true } });
    if (!product || !product.isActive) throw Object.assign(new Error(`Product ${it.productId} not found`), { status: 404, code: 'not_found' });
    const variant = it.variantId ? product.variants.find(v => v.id === it.variantId) : null;
    if (it.variantId && !variant) throw Object.assign(new Error(`Variant ${it.variantId} not found`), { status: 404, code: 'not_found' });
    const price = variant ? Number(variant.price) : Number(product.price);
    subtotal += price * it.quantity;
    enriched.push({ ...it, price, title: variant ? `${product.title} — ${variant.title}` : product.title, sku: variant?.sku || product.sku, variant });
  }
  const total = subtotal;
  const gst = total * 0.1 / 1.1;
  const pendingLedgerKey = `pending_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

  const order = await prisma.$transaction(async (tx) => {
    // Atomic variant stock decrement + ledger
    for (const e of enriched) {
      if (e.variantId && e.variant) {
        // Check tracked stock — POS sale is immediate, so must have inventory unless made_to_order
        const prod = await tx.product.findUnique({ where: { id: e.productId }, select: { stockMode: true } });
        if (prod?.stockMode === 'tracked') {
          const upd = await tx.productVariant.updateMany({ where: { id: e.variantId, inventoryQuantity: { gte: e.quantity } }, data: { inventoryQuantity: { decrement: e.quantity } } });
          if (upd.count === 0) {
            const v = await tx.productVariant.findUnique({ where: { id: e.variantId } });
            throw Object.assign(new Error(`Insufficient stock for ${v?.title}: only ${v?.inventoryQuantity ?? 0} left`), { status: 422, code: 'out_of_stock' });
          }
          await tx.inventoryLedger.create({ data: { variantId: e.variantId, delta: -e.quantity, reason: 'sale', orderId: pendingLedgerKey, userId: req.user.id } });
        }
      }
    }
    const created = await tx.order.create({
      data: {
        orderNumber: `POS-${Date.now().toString().slice(-8)}`,
        idempotencyKey: idempotencyKey || undefined,
        email, shippingName, shippingSuburb: 'Perth', shippingState: 'WA', shippingPostcode: '6000',
        subtotal, shippingCost: 0, discountTotal: 0, taxTotal: gst, total,
        status: 'paid', paymentStatus: 'paid', paymentMethod,
        lines: { create: enriched.map(e => ({ productId: e.productId, variantId: e.variantId || null, title: e.title, sku: e.sku, quantity: e.quantity, unitPrice: e.price, lineTotal: e.price * e.quantity })) }
      }
    });
    // (no .catch inside a transaction — a failed statement aborts the whole tx anyway)
    await tx.inventoryLedger.updateMany({ where: { orderId: pendingLedgerKey }, data: { orderId: created.id } });
    if (sessionId) await tx.posPayment.create({ data: { sessionId, orderId: created.id, amount: total, method: paymentMethod } });
    // Per-location levels + stock movements
    for (const e of enriched) {
      const loc = await tx.inventoryLocation.findFirst({ where: { isDefault: true } }) || await tx.inventoryLocation.findFirst();
      if (loc) {
        // Prisma upsert rejects null on the @@unique([productId, variantId, locationId])
        // nullable member — use findFirst + create/update instead.
        const variantId = e.variantId || null;
        const level = await tx.inventoryLevel.findFirst({ where: { productId: e.productId, variantId, locationId: loc.id } });
        if (level) {
          await tx.inventoryLevel.update({ where: { id: level.id }, data: { onHand: { decrement: e.quantity } } });
        } else {
          await tx.inventoryLevel.create({ data: { productId: e.productId, variantId, locationId: loc.id, onHand: -e.quantity } });
        }
        await tx.stockMovement.create({ data: { productId: e.productId, variantId: variantId, locationId: loc.id, type: 'sale', quantity: -e.quantity, reference: created.orderNumber, userId: req.user.id } });
      }
    }
    // $0 loyalty: POS paid sale earns points per the configured earn rate
    return created;
  });
  // Loyalty is best-effort and must NOT share the sale transaction (a failure
  // would abort the whole sale). Run it after, on the global client.
  await earnForOrder(prisma, { email, total, orderId: order.id, reason: 'purchase' }).catch(()=>{});
  const S = await getSettings();
  res.status(201).json({ ...order, receiptFooter: S.pos_receipt_footer || '' });
}));

export default router;
