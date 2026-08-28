import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { calculateShipping, calculateGstInclusive } from '../services/shipping.js';
import { stripe } from '../services/stripe.js';

const router = Router();

function orderNumber() {
  const d = new Date();
  return `KFK-${d.getFullYear()}-${Math.random().toString(36).toUpperCase().slice(2,7)}${Date.now().toString().slice(-4)}`;
}

router.post('/checkout', async (req, res) => {
  const schema = z.object({
    cartId: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
    shippingName: z.string().min(2),
    shippingAddress: z.string().min(5),
    shippingSuburb: z.string().min(2),
    shippingState: z.string().min(2).default('WA'),
    shippingPostcode: z.string().min(4),
    discountCode: z.string().optional().nullable(),
    customerNote: z.string().optional().nullable(),
    paymentMethod: z.enum(['cash','bank_transfer','pickup','manual']).default('manual'),
  });
  const data = schema.parse(req.body);
  const cart = await prisma.cart.findUnique({ where: { id: data.cartId }, include: { items: { include: { product: true, variant: true } } } });
  if (!cart || !cart.items.length) return res.status(400).json({ error: 'Cart empty' });

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

  const order = await prisma.order.create({
    data: {
      orderNumber: orderNumber(),
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

  // Stripe disabled — manual checkout only (cash / bank_transfer / pickup)
  // When STRIPE_ENABLED=true, this block will create Checkout Session
  const checkoutUrl = null;
  if (stripe) {
    // kept for future re-enable, currently stripe is null
  }

  // Clear cart items
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

  res.json({ order, shipping, gst, checkoutUrl, paymentInstructions: data.paymentMethod === 'bank_transfer' ? 'Bank transfer details will be emailed. Order held pending payment.' : data.paymentMethod === 'pickup' ? 'Pickup from Perth Studio — pay on collection. You will receive a QR ticket.' : 'Order placed — manual payment.' });
});

router.get('/my', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const orders = await prisma.order.findMany({ where: { email: user.email }, orderBy: { createdAt: 'desc' }, include: { lines: true } });
  res.json(orders);
});

router.get('/:orderNumber', async (req, res) => {
  const order = await prisma.order.findUnique({ where: { orderNumber: req.params.orderNumber }, include: { lines: true, history: true, payments: true } });
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json(order);
});

router.get('/', requireAuth, async (req, res) => {
  // admin list
  if (!['admin','developer','maker','staff'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  const orders = await prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { lines: true } });
  res.json(orders);
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  if (!['admin','developer','maker','staff'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  const { status, note } = req.body;
  const order = await prisma.order.update({ where: { id: req.params.id }, data: { status } });
  await prisma.orderStatusHistory.create({ data: { orderId: order.id, fromStatus: order.status, toStatus: status, note } });
  res.json(order);
});

export default router;
