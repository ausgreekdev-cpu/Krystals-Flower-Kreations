import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { calculateShipping, calculateGstInclusive } from '../services/shipping.js';
import { createPayPalOrder, capturePayPalOrder, refundPayPalCapture, assertPayPalReady } from '../services/paypal.js';
import { sendOrderConfirmation, sendAdminOrderAlert, sendStatusUpdate } from '../services/email.js';
import { earnForOrder } from '../services/loyaltyService.js';
import { getSettings, paymentInstructionsFor } from '../lib/settingsSchema.js';
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
  acceptTerms: z.boolean().optional(),
  paymentMethod: z.enum(['paypal','cash','bank_transfer','pickup','manual']).default('manual'),
}).strict();

function idempotencyKeyOf(req) {
  return req.headers['idempotency-key'] ? String(req.headers['idempotency-key']).slice(0, 100) : null;
}

// Shared checkout pipeline: price the cart, deduct stock, create the order.
// Returns { error: { status, body } } for expected client failures,
// { idempotent: true, order, shipping, gst } on an Idempotency-Key hit, or
// { order, shipping, gst, paymentInstructions } on success.
// deferFinalize=true (PayPal path) keeps the cart and withholds confirmation
// emails until the payment is captured — /paypal/capture finalizes instead.
async function prepareCheckout({ data, publicSettings, idempotencyKey, deferFinalize = false }) {
  // Enforce the admin-configured payment methods list (checkout_payment_methods).
  const enabledMethods = String(publicSettings.checkout_payment_methods || '').split(',').map(m => m.trim()).filter(Boolean);
  if (enabledMethods.length && !enabledMethods.includes(data.paymentMethod)) {
    const LABELS = { paypal: 'PayPal', bank_transfer: 'Bank transfer', pickup: 'Pay on pickup', cash: 'Cash', manual: 'Manual' };
    return { error: { status: 422, body: {
      error: `${LABELS[data.paymentMethod] || data.paymentMethod} payments are not available right now`,
      code: 'payment_method_disabled',
      details: { enabled: enabledMethods },
    } } };
  }

  // Terms acceptance (settings: terms_required + terms_url)
  if (publicSettings.terms_required === '1' && !data.acceptTerms) {
    return { error: { status: 422, body: {
      error: 'Please accept the terms to continue',
      code: 'terms_required',
      details: { termsUrl: publicSettings.terms_url || null },
    } } };
  }

  // Order notes can be switched off admin-side — ignore anything sent while disabled
  if (publicSettings.enable_order_notes === '0') data.customerNote = null;

  // Idempotency: return existing order if same key already used
  if (idempotencyKey) {
    const existing = await prisma.order.findUnique({ where: { idempotencyKey }, include: { lines: true } });
    if (existing) {
      const gstExisting = await calculateGstInclusive(Number(existing.total));
      return { idempotent: true, order: existing, shipping: { price: Number(existing.shippingCost) }, gst: gstExisting };
    }
  }

  const cart = await prisma.cart.findUnique({ where: { id: data.cartId }, include: { items: { include: { product: true, variant: true } } } });
  if (!cart || !cart.items.length) return { error: { status: 400, body: { error: 'Cart empty', code: 'cart_empty' } } };

  const inactive = cart.items.find((it) => !it.product.isActive || it.product.deletedAt);
  if (inactive) return { error: { status: 409, body: { error: `${inactive.product.title} is no longer available — remove it from your cart`, code: 'product_unavailable' } } };

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
  if (data.discountCode) {    const disc = await prisma.discount.findUnique({ where: { code: data.discountCode.toUpperCase(), deletedAt: null } });
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

  // Minimum order total (settings: min_order_amount) — checked after discounts.
  const minOrder = Number(publicSettings.min_order_amount) || 0;
  const goodsTotal = subtotal - discountTotal;
  if (minOrder > 0 && goodsTotal < minOrder) {
    return { error: { status: 422, body: {
      error: `Minimum order is $${minOrder.toFixed(2)}`,
      code: 'below_minimum_order',
      details: { minimum: minOrder, subtotal: goodsTotal },
    } } };
  }

  const shipping = await calculateShipping({ postcode: data.shippingPostcode, subtotal: goodsTotal, weightGrams: weight });
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

    // Clear cart (deferred on the PayPal path — the order only counts once
    // PayPal capture succeeds; the frontend clears its own cart there)
    if (!deferFinalize) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    return created;
  });

  // Loyalty points are earned only when the order is marked paid (staff PATCH
  // /:id/status for manual payments, /paypal/capture for PayPal).

  if (!deferFinalize) {
    // Email receipt (non-blocking, logs if SMTP not configured)
    await sendOrderConfirmation(order).catch(()=>{});
    // Studio alert (settings: admin_order_alert_enabled / _recipient)
    await sendAdminOrderAlert(order).catch(()=>{});
  }

  return { order, shipping, gst, paymentInstructions: paymentInstructionsFor(data.paymentMethod, publicSettings) };
}

// ── Manual checkout (bank transfer / pickup / cash / invoice) ───────────────
router.post('/checkout', rateLimit('checkout', 5, 1), validate(checkoutSchema), asyncHandler(async (req, res) => {
  const publicSettings = await getSettings({ onlyPublic: true });
  const result = await prepareCheckout({ data: req.validated, publicSettings, idempotencyKey: idempotencyKeyOf(req) });
  if (result.error) return res.status(result.error.status).json(result.error.body);
  if (result.idempotent) {
    return res.json({ order: result.order, shipping: result.shipping, gst: result.gst, checkoutUrl: null, idempotent: true });
  }
  res.json({ order: result.order, shipping: result.shipping, gst: result.gst, checkoutUrl: null, paymentInstructions: result.paymentInstructions });
}));

// ── PayPal checkout (Orders v2) ─────────────────────────────────────────────
// Step 1 — run the shared checkout pipeline with finalize deferred, then
// create (or reuse) the PayPal order. The store order stays pending_payment
// until step 2 confirms the money moved. The amount is derived server-side
// from the order; the client never supplies one.
router.post('/paypal/create', rateLimit('paypal', 10, 1), validate(checkoutSchema), asyncHandler(async (req, res) => {
  await assertPayPalReady(); // 503 before any stock/order is reserved when PayPal can't take money
  const data = { ...req.validated, paymentMethod: 'paypal' }; // route semantics override the body
  const publicSettings = await getSettings({ onlyPublic: true });
  const result = await prepareCheckout({ data, publicSettings, idempotencyKey: idempotencyKeyOf(req), deferFinalize: true });
  if (result.error) return res.status(result.error.status).json(result.error.body);
  const order = result.order;
  if (order.paymentStatus === 'paid' || order.status === 'refunded') {
    // Already captured (idempotent retry after success) — frontend shows success.
    return res.json({ order, paypalOrderId: order.paypalOrderId, paid: true });
  }
  if (order.status === 'cancelled') {
    return res.status(409).json({ error: 'Order can no longer be paid', code: 'order_not_payable' });
  }
  if (order.paypalOrderId) return res.json({ order, paypalOrderId: order.paypalOrderId });
  const pp = await createPayPalOrder({ order });
  const saved = await prisma.order.update({ where: { id: order.id }, data: { paypalOrderId: pp.id } });
  res.json({ order: saved, paypalOrderId: saved.paypalOrderId });
}));

const paypalCaptureSchema = z.object({ paypalOrderId: z.string().min(3).max(128) }).strict();

// Step 2 — capture the approved PayPal order, then finalize the store order
// (paid flip, Payment row, loyalty + the emails deferred from step 1).
// Safe without auth: the paypalOrderId comes from our own DB, amounts are
// server-derived, and a capture can only move an order towards paid.
router.post('/paypal/capture', rateLimit('paypal', 10, 1), validate(paypalCaptureSchema), asyncHandler(async (req, res) => {
  const { paypalOrderId } = req.validated;
  const order = await prisma.order.findUnique({ where: { paypalOrderId }, include: { lines: true } });
  if (!order) return res.status(404).json({ error: 'PayPal session not found', code: 'not_found' });
  if (order.paymentStatus === 'paid') return res.json({ order, captured: true, idempotent: true });
  if (order.paymentStatus === 'refunded' || order.status === 'cancelled' || order.status === 'refunded') {
    return res.status(409).json({ error: 'Order can no longer be paid', code: 'order_not_payable' });
  }

  const cap = await capturePayPalOrder(paypalOrderId); // throws 503/502 when disabled/unreachable

  // Verify PayPal captured what the order says (skip when amount unknown, e.g. mock).
  if (cap.amount != null) {
    const got = Math.round(Number(cap.amount) * 100);
    const want = Math.round(Number(order.total) * 100);
    if (got < want) {
      console.error(JSON.stringify({ level: 'error', msg: 'paypal_amount_mismatch', orderNumber: order.orderNumber, got, want, captureId: cap.captureId }));
      throw Object.assign(new Error('PayPal captured amount does not match the order'), { status: 409, code: 'paypal_amount_mismatch', expose: true });
    }
  }

  const { isNew } = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id: order.id } });
    if (!current) throw Object.assign(new Error('Order not found'), { status: 404, code: 'not_found' });
    if (current.paymentStatus === 'paid') return { isNew: false };
    const toPaid = current.status === 'pending_payment' || current.status === 'draft';
    const updated = await tx.order.update({
      where: { id: current.id },
      data: { paymentStatus: 'paid', paymentMethod: 'paypal', ...(toPaid ? { status: 'paid' } : {}) },
    });
    await tx.orderStatusHistory.create({ data: { orderId: updated.id, fromStatus: current.status, toStatus: updated.status, note: `PayPal capture ${cap.captureId || 'unknown'}` } });
    await tx.payment.create({ data: {
      orderId: updated.id, amount: updated.total, method: 'paypal', status: 'paid',
      reference: cap.captureId || null,
      rawJson: cap.raw ? JSON.stringify(cap.raw).slice(0, 20000) : null,
    } });
    return { isNew: true };
  });

  const fresh = await prisma.order.findUnique({ where: { id: order.id }, include: { lines: true } });
  if (isNew) {
    // Finalize deferred from /paypal/create: loyalty + emails now money moved.
    await earnForOrder(prisma, { email: fresh.email, total: fresh.total, orderId: fresh.id, reason: 'purchase' });
    await sendOrderConfirmation(fresh).catch(()=>{});
    await sendAdminOrderAlert(fresh).catch(()=>{});
  }
  res.json({ order: fresh, captured: true, idempotent: !isNew });
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

// Full refund of a captured PayPal order: refunds the capture upstream, then
// mirrors the PATCH /:id/status refund behaviour (transition guard, restock,
// history, audit, customer email).
router.post('/:id/refund', authenticate, asyncHandler(async (req, res) => {
  if (!['admin','developer'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  const order = await prisma.order.findUnique({ where: { id: String(req.params.id).slice(0, 60) }, include: { lines: true, payments: true } });
  if (!order) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  if (order.paymentMethod !== 'paypal') return res.status(409).json({ error: 'Only PayPal orders can be refunded here', code: 'not_paypal_order' });
  if (order.paymentStatus === 'refunded' || order.status === 'refunded') return res.status(409).json({ error: 'Order already refunded', code: 'already_refunded' });
  if (order.paymentStatus !== 'paid') return res.status(409).json({ error: 'Nothing to refund — payment was never captured', code: 'nothing_to_refund' });
  if (!(STATUS_TRANSITIONS[order.status] || []).includes('refunded')) {
    return res.status(409).json({ error: `Cannot move order from '${order.status}' to 'refunded'`, code: 'invalid_transition' });
  }

  // Capture id stored on the Payment row at capture time.
  const captureId = (order.payments.find(p => p.method === 'paypal' && p.status === 'paid') || order.payments.find(p => p.method === 'paypal'))?.reference || null;
  if (!captureId) return res.status(409).json({ error: 'No PayPal capture found for this order', code: 'missing_capture' });

  const refund = await refundPayPalCapture(captureId); // throws 503/502 when disabled/unreachable

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id: order.id } });
    if (!current) throw Object.assign(new Error('Order not found'), { status: 404, code: 'not_found' });
    const o = await tx.order.update({ where: { id: order.id }, data: { status: 'refunded', paymentStatus: 'refunded' } });
    await tx.orderStatusHistory.create({ data: { orderId: o.id, fromStatus: current.status, toStatus: 'refunded', note: `PayPal refund ${refund.id}` } });
    return o;
  });

  await prisma.payment.updateMany({ where: { orderId: order.id, method: 'paypal', status: 'paid' }, data: { status: 'refunded' } });
  await restockOrder(updated, order.lines);
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'order_refund', entityType: 'order', entityId: order.id, details: { orderNumber: order.orderNumber, via: 'paypal', refundId: refund.id } });
  await sendStatusUpdate(updated, order.status, 'refunded').catch(()=>{});
  res.json(updated);
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

  // Customer status email (settings: customer_status_emails_enabled)
  await sendStatusUpdate(order, current.status, status).catch(()=>{});
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
