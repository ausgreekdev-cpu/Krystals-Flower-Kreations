import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { calculateShipping, calculateGstInclusive } from '../services/shipping.js';
import { stripe } from '../services/stripe.js';

const router = Router();

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
      const gstExisting = calculateGstInclusive(Number(existing.total));
      return res.json({ order: existing, shipping: { price: Number(existing.shippingCost) }, gst: gstExisting, checkoutUrl: null, idempotent: true });
    }
  }

  const cart = await prisma.cart.findUnique({ where: { id: data.cartId }, include: { items: { include: { product: true, variant: true } } } });
  if (!cart || !cart.items.length) return res.status(400).json({ error: 'Cart empty', code: 'cart_empty' });

  let subtotal = 0;
  let weight = 0;
  for (const it of cart.items) {
    subtotal += Number(it.priceSnapshot) * it.quantity;
    weight += (it.product.weightGrams || 300) * it.quantity;
  }

  let discountTotal = 0;
  if (data.discountCode) {
    const disc = await prisma.discount.findUnique({ where: { code: data.discountCode.toUpperCase() } });
    if (disc && disc.isActive && (!disc.maxUses || disc.usedCount < disc.maxUses)) {
      if (disc.type === 'percent') discountTotal = subtotal * Number(disc.value) / 100;
      else discountTotal = Number(disc.value);
    }
  }

  const shipping = await calculateShipping({ postcode: data.shippingPostcode, subtotal: subtotal - discountTotal, weightGrams: weight });
  const total = Math.max(0, subtotal - discountTotal + shipping.price);
  const gst = calculateGstInclusive(total);

  // Atomic inventory deduction + order create in transaction
  const order = await prisma.$transaction(async (tx) => {
    // Check and decrement variant stock for tracked items
    for (const it of cart.items) {
      if (it.variantId && it.product.stockMode === 'tracked') {
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
          data: { variantId: it.variantId, delta: -it.quantity, reason: 'sale', orderId: 'pending' }
        });
      }
    }

    const created = await tx.order.create({
      data: {
        orderNumber: orderNumber(),
        idempotencyKey: idempotencyKey || undefined,
        email: data.email, phone: data.phone,
        subtotal, discountTotal, shippingCost: shipping.price, taxTotal: gst.gst, total,
        shippingName: data.shippingName, shippingAddress: data.shippingAddress,
        shippingSuburb: data.shippingSuburb, shippingState: data.shippingState,
        shippingPostcode: data.shippingPostcode, customerNote: data.customerNote,
        status: data.paymentMethod === 'cash' ? 'paid' : 'pending_payment',
        paymentStatus: data.paymentMethod === 'cash' ? 'paid' : 'pending',
        paymentMethod: data.paymentMethod,
        lines: {
          create: cart.items.map(it => ({
            productId: it.productId, variantId: it.variantId,
            title: it.variant ? `${it.product.title} — ${it.variant.title}` : it.product.title,
            sku: it.variant?.sku || it.product.sku,
            quantity: it.quantity, unitPrice: it.priceSnapshot, lineTotal: Number(it.priceSnapshot) * it.quantity,
            isDigital: it.product.stockMode === 'digital',
          }))
        }
      }, include: { lines: true }
    });

    // Update ledger orderIds from pending to real
    await tx.inventoryLedger.updateMany({ where: { orderId: 'pending' }, data: { orderId: created.id } }).catch(()=>{});

    // Clear cart
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    return created;
  });

  const checkoutUrl = null; // Stripe disabled
  if (stripe) { /* manual */ }

  // $0 loyalty: earn 1pt per $1 on paid orders (cash), plus manual pickup/bank will earn when later marked paid via PATCH
  if (order.paymentStatus === 'paid' || order.status === 'paid') {
    try {
      const pts = Math.floor(Number(order.total));
      if (pts > 0) {
        let acc = await prisma.loyaltyAccount.findUnique({ where: { email: order.email } });
        if (!acc) acc = await prisma.loyaltyAccount.create({ data: { email: order.email, points: 0, tier: 'seedling' } });
        const newPoints = acc.points + pts;
        const tier = newPoints >= 500 ? 'garden' : newPoints >= 100 ? 'blossom' : 'seedling';
        await prisma.loyaltyAccount.update({ where: { id: acc.id }, data: { points: newPoints, tier } });
        await prisma.loyaltyTransaction.create({ data: { accountId: acc.id, pointsDelta: pts, reason: 'purchase', orderId: order.id } });
      }
    } catch {}
  }

  res.json({ order, shipping, gst, checkoutUrl, paymentInstructions: data.paymentMethod === 'bank_transfer' ? 'Bank transfer details will be emailed. Order held pending payment.' : data.paymentMethod === 'pickup' ? 'Pickup from Perth Studio — pay on collection. You will receive a QR ticket.' : 'Order placed — manual payment.' });
}));

router.get('/my', authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(401).json({ error: 'User not found', code: 'unauthorized' });
  const orders = await prisma.order.findMany({ where: { email: user.email }, orderBy: { createdAt: 'desc' }, include: { lines: true } });
  res.json(orders);
}));

router.get('/:orderNumber', asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({ where: { orderNumber: req.params.orderNumber }, include: { lines: true, history: true, payments: true } });
  if (!order) return res.status(404).json({ error: 'Not found', code: 'not_found' });
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
  if (!status || typeof status !== 'string' || status.length > 50) return res.status(400).json({ error: 'Invalid status', code: 'validation_failed' });
  const current = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const order = await prisma.order.update({ where: { id: req.params.id }, data: { status, paymentStatus: status==='paid' ? 'paid' : undefined } });
  await prisma.orderStatusHistory.create({ data: { orderId: order.id, fromStatus: current.status, toStatus: status, note: note ? String(note).slice(0,500) : null } });
  // Earn loyalty when marked paid (for bank_transfer/pickup later paid at POS)
  if (status === 'paid' && current.status !== 'paid') {
    try {
      const pts = Math.floor(Number(order.total));
      if (pts>0) {
        let acc = await prisma.loyaltyAccount.findUnique({ where:{ email: order.email } });
        if(!acc) acc = await prisma.loyaltyAccount.create({ data:{ email: order.email, points:0, tier:'seedling' } });
        const newPoints = acc.points + pts;
        const tier = newPoints>=500?'garden': newPoints>=100?'blossom':'seedling';
        await prisma.loyaltyAccount.update({ where:{ id:acc.id }, data:{ points:newPoints, tier } });
        await prisma.loyaltyTransaction.create({ data:{ accountId:acc.id, pointsDelta:pts, reason:'purchase', orderId:order.id } });
      }
    } catch {}
  }
  res.json(order);
}));

export default router;
