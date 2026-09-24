import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { calculateShipping, calculateGstInclusive } from '../services/shipping.js';
import { stripe } from '../services/stripe.js';
import { sendOrderConfirmation } from '../services/email.js';
import { earnForOrder } from '../services/loyaltyService.js';
import { audit } from '../lib/audit.js';

const router = Router();

const ORDER_STATUSES = ['draft','pending_payment','paid','making','ready','shipped','delivered','cancelled','refunded','partially_refunded'];

// Allowed next states. Terminal states (cancelled/refunded/partially_refunded)
// can't transition further — prevents refunded→paid, double-cancel, etc.
const STATUS_TRANSITIONS = {
  draft: ['pending_payment', 'paid', 'cancelled'],
  pending_payment: ['paid', 'cancelled', 'refunded'],
  paid: ['making', 'cancelled', 'refunded', 'partially_refunded'],
  making: ['ready', 'cancelled', 'refunded'],
  ready: ['shipped', 'delivered', 'cancelled', 'refunded'],
  shipped: ['delivered', 'refunded', 'partially_refunded'],
  delivered: ['refunded', 'partially_refunded'],
  cancelled: [],
  refunded: [],
  partially_refunded: [],
};

function orderNumber() {
  const d = new Date();
  return `KFK-${d.getFullYear()}-${Math.random().toString(36).toUpperCase().slice(2,7)}${Date.now().toString().slice(-4)}`;
}

const checkoutSchema = z.object({
  cartId: z.string().min(8).max(100),
  email: z.string().email().max(254),
  phone: z.string().max(30).optional(),
  shippingName: z.string().min(2).max(120),
  shippingAddress: z.string().min(5).max(500),
  shippingSuburb: z.string().min(2).max(100),
  shippingState: z.string().min(2).max(50).default('WA'),
  shippingPostcode: z.string().min(3).max(10).regex(/^[0-9A-Za-z ]+$/),
  discountCode: z.string().max(30).optional().nullable(),
  customerNote: z.string().max(2000).optional().nullable(),
  paymentMethod: z.enum(['cash','bank_transfer','pickup','manual']).default('manual'),
}).strict();

router.post('/checkout', rateLimit('checkout', 5, 1), validate(checkoutSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  const idempotencyKey = req.headers['idempotency-key'] ? String(req.headers['idempotency-key']).slice(0,100) : null;

  // Idempotency: return existing order if same key already used
  if (idempotencyKey) {
    const existing = await prisma.order.findUnique({ where: { idempotencyKey }, include: { lines: true } });
    if (existing) {
      const gstExisting = await calculateGstInclusive(Number(existing.total));
      return res.json({ order: existing, shipping: { price: Number(existing.shippingCost) }, gst: gstExisting, checkoutUrl: null, idempotent: true });
    }
  }

  const cart = await prisma.cart.findUnique({ where: { id: data.cartId }, include: { items: { include: { product: true, variant: true } } } });
  if (!cart || !cart.items.length) return res.status(400).json({ error: 'Cart empty', code: 'cart_empty' });

  const inactive = cart.items.find((it) => !it.product.isActive || it.product.deletedAt);
  if (inactive) return res.status(409).json({ error: `${inactive.product.title} is no longer available — remove it from your cart`, code: 'product_unavailable' });

  // Re-check current price (not the stale add-to-cart snapshot) so a price change
  // is honoured at checkout time.
  let subtotal = 0;
  let weight = 0;
  const pricedItems = cart.items.map((it) => {
    const unitPrice = Number(it.variant ? it.variant.price : it.product.price);
    return { ...it, unitPrice };
  });
  for (const it of pricedItems) {
    subtotal += it.unitPrice * it.quantity;
    weight += (it.product.weightGrams || 300) * it.quantity;
  }

  let discountTotal = 0;
  let appliedDiscount = null;
  if (data.discountCode) {
    const disc = await prisma.discount.findUnique({ where: { code: data.discountCode.toUpperCase(), deletedAt: null } });
    if (disc && disc.isActive) {
      const now = new Date();
      if (disc.startsAt && now < new Date(disc.startsAt)) {/* not started */ }
      else if (disc.endsAt && now > new Date(disc.endsAt)) {/* expired */ }
      else if (disc.minSpend && subtotal < Number(disc.minSpend)) {/* min not met */ }
      else if (disc.maxUses && disc.usedCount >= disc.maxUses) {/* max used */ }
      else {
        appliedDiscount = disc;
        if (disc.type === 'percent') discountTotal = subtotal * Number(disc.value) / 100;
        else discountTotal = Number(disc.value);
        discountTotal = Math.min(discountTotal, subtotal); // cap
      }
    }
  }

  const shipping = await calculateShipping({ postcode: data.shippingPostcode, subtotal: subtotal - discountTotal, weightGrams: weight });
  const total = Math.max(0, subtotal - discountTotal + shipping.price);
  const gst = await calculateGstInclusive(total);

  // Atomic inventory deduction + order create in transaction
  const pendingLedgerKey = `pending_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const order = await prisma.$transaction(async (tx) => {
    // Check and decrement variant stock for tracked items (also covers tracked
    // products without variants via the default-location InventoryLevel row)
    for (const it of cart.items) {
      if (it.product.stockMode !== 'tracked') continue;
      if (it.variantId) {
        const updated = await tx.productVariant.updateMany({
          where: { id: it.variantId, inventoryQuantity: { gte: it.quantity } },
          data: { inventoryQuantity: { decrement: it.quantity } }
        });
        if (updated.count === 0) {
          const v = await tx.productVariant.findUnique({ where: { id: it.variantId } });
          throw Object.assign(new Error(`Insufficient stock for ${v?.title || it.variantId}: only ${v?.inventoryQuantity ?? 0} left`), { status: 422, code: 'out_of_stock' });
        }
        // Ledger
        await tx.inventoryLedger.create({
          data: { variantId: it.variantId, delta: -it.quantity, reason: 'sale', orderId: pendingLedgerKey }
        });
      } else {
        // Tracked product without a variant — use its default-location InventoryLevel
        const loc = await tx.inventoryLocation.findFirst({ where: { isDefault: true } }) || await tx.inventoryLocation.findFirst();
        const level = loc ? await tx.inventoryLevel.findFirst({ where: { productId: it.productId, variantId: null, locationId: loc.id } }) : null;
        if (!level || level.onHand < it.quantity) {
          throw Object.assign(new Error(`Insufficient stock for ${it.product.title}: only ${level?.onHand ?? 0} left`), { status: 422, code: 'out_of_stock' });
        }
        await tx.inventoryLevel.update({ where: { id: level.id }, data: { onHand: { decrement: it.quantity } } });
        if (loc) {
          await tx.stockMovement.create({ data: { productId: it.productId, variantId: null, locationId: loc.id, type: 'sale', quantity: -it.quantity, reference: 'checkout', userId: null } });
        }
      }
    }

    const created = await tx.order.create({
      data: {
        orderNumber: orderNumber(),
        idempotencyKey: idempotencyKey || undefined,
        email: data.email.trim().toLowerCase(), phone: data.phone,
        subtotal, discountTotal, shippingCost: shipping.price, taxTotal: gst.gst, total,
        shippingName: data.shippingName, shippingAddress: data.shippingAddress,
        shippingSuburb: data.shippingSuburb, shippingState: data.shippingState,
        shippingPostcode: data.shippingPostcode, customerNote: data.customerNote,
        // Online checkout never self-confirms payment — staff mark it paid
        // (PATCH /:id/status) once cash/bank transfer is actually received.
        status: 'pending_payment',
        paymentStatus: 'pending',
        paymentMethod: data.paymentMethod,
        lines: {
          create: pricedItems.map(it => ({
            productId: it.productId, variantId: it.variantId,
            title: it.variant ? `${it.product.title} — ${it.variant.title}` : it.product.title,
            sku: it.variant?.sku || it.product.sku,
            quantity: it.quantity, unitPrice: it.unitPrice, lineTotal: it.unitPrice * it.quantity,
            isDigital: it.product.stockMode === 'digital',
          }))
        }
      }, include: { lines: true }
    });

    // Update ledger orderIds from pending to real (unique per checkout, so
    // concurrent orders never steal each other's ledger rows)
    // (no .catch inside a transaction — a failed statement aborts the whole tx anyway)
    await tx.inventoryLedger.updateMany({ where: { orderId: pendingLedgerKey }, data: { orderId: created.id } });

    // Increment discount usedCount atomically, respecting maxUses under concurrency
    if (appliedDiscount) {
      const where = appliedDiscount.maxUses ? { id: appliedDiscount.id, usedCount: { lt: appliedDiscount.maxUses } } : { id: appliedDiscount.id };
      const inc = await tx.discount.updateMany({ where, data: { usedCount: { increment: 1 } } });
      if (inc.count === 0) throw Object.assign(new Error('Discount code has reached its usage limit'), { status: 409, code: 'discount_exhausted' });
    }

    // Clear cart
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    return created;
  });

  const checkoutUrl = null; // Stripe disabled
  if (stripe) { /* manual */ }

  // Loyalty points are earned only when staff mark the order paid (PATCH /:id/status).

  // Email receipt (non-blocking, logs if SMTP not configured)
  sendOrderConfirmation(order).catch(()=>{});

  res.json({ order, shipping, gst, checkoutUrl, paymentInstructions: data.paymentMethod === 'bank_transfer' ? 'Bank transfer details will be emailed. Order held pending payment.' : data.paymentMethod === 'pickup' ? 'Pickup from Perth Studio — pay on collection. You will receive a QR ticket.' : data.paymentMethod === 'cash' ? 'Order placed — pay cash on collection/delivery. We\'ll confirm once received.' : 'Order placed — manual payment.' });
}));

router.get('/my', authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(401).json({ error: 'User not found', code: 'unauthorized' });
  const orders = await prisma.order.findMany({ where: { email: user.email }, orderBy: { createdAt: 'desc' }, take: 100, include: { lines: true } });
  res.json(orders);
}));

router.get('/:orderNumber', authenticate, asyncHandler(async (req, res) => {
  const orderNumber = String(req.params.orderNumber).slice(0,50);
  const order = await prisma.order.findUnique({ where: { orderNumber }, include: { lines: true, history: true, payments: true } });
  if (!order) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  // Gate: customer can only view own order via email, staff/maker/admin can view any
  const isStaff = ['admin','developer','maker','staff'].includes(req.user.role);
  if (!isStaff && order.email !== req.user.email) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  res.json(order);
}));

router.get('/', authenticate, asyncHandler(async (req, res) => {
  if (!['admin','developer','maker','staff'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  const orders = await prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { lines: true } });
  res.json(orders);
}));

router.patch('/:id/status', authenticate, asyncHandler(async (req, res) => {
  if (!['admin','developer','maker','staff'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  const { status, note } = req.body;
  if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status', code: 'validation_failed' });
  const current = await prisma.order.findUnique({ where: { id: req.params.id }, include: { lines: true } });
  if (!current) return res.status(404).json({ error: 'Not found', code: 'not_found' });

  // Enforce a legal transition (no-op same-state allowed)
  if (status !== current.status && !(STATUS_TRANSITIONS[current.status] || []).includes(status)) {
    return res.status(409).json({ error: `Cannot move order from '${current.status}' to '${status}'`, code: 'invalid_transition' });
  }

  const order = await prisma.order.update({ where: { id: req.params.id }, data: { status, paymentStatus: status==='paid' ? 'paid' : undefined } });
  await prisma.orderStatusHistory.create({ data: { orderId: order.id, fromStatus: current.status, toStatus: status, note: note ? String(note).slice(0,500) : null } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'order_status', entityType: 'order', entityId: order.id, details: { from: current.status, to: status, orderNumber: order.orderNumber } });

  // Restock when fully cancelling/refunding a previously-fulfilling order.
  // Checkout deducts stock at creation, so we reverse it here. The transition
  // map guarantees this runs at most once per order (terminal states are closed).
  if ((status === 'cancelled' || status === 'refunded') && current.status !== status) {
    await restockOrder(order, current.lines);
  }

  // Earn loyalty when marked paid (for bank_transfer/pickup later paid at POS)
  if (status === 'paid' && current.status !== 'paid') {
    await earnForOrder(prisma, { email: order.email, total: order.total, orderId: order.id, reason: 'purchase' });
  }
  res.json(order);
}));

// Reverse checkout's stock deduction for tracked lines (sequential, pgbouncer-safe).
async function restockOrder(order, lines) {
  const productIds = [...new Set(lines.filter(l => !l.isDigital).map(l => l.productId))];
  if (!productIds.length) return;
  const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, stockMode: true } });
  const tracked = new Set(products.filter(p => p.stockMode === 'tracked').map(p => p.id));

  for (const line of lines) {
    if (line.isDigital || !tracked.has(line.productId)) continue;
    try {
      if (line.variantId) {
        await prisma.productVariant.update({ where: { id: line.variantId }, data: { inventoryQuantity: { increment: line.quantity } } });
        await prisma.inventoryLedger.create({ data: { variantId: line.variantId, delta: line.quantity, reason: 'return', orderId: order.id, userId: null } });
      } else {
        const loc = await prisma.inventoryLocation.findFirst({ where: { isDefault: true } }) || await prisma.inventoryLocation.findFirst();
        const level = loc ? await prisma.inventoryLevel.findFirst({ where: { productId: line.productId, variantId: null, locationId: loc.id } }) : null;
        if (level) {
          await prisma.inventoryLevel.update({ where: { id: level.id }, data: { onHand: { increment: line.quantity } } });
          await prisma.stockMovement.create({ data: { productId: line.productId, variantId: null, locationId: loc.id, type: 'return', quantity: line.quantity, reference: order.orderNumber, userId: null } });
        }
      }
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', msg: 'restock failed', orderId: order.id, lineId: line.id, err: e?.message }));
    }
  }
}

export default router;
