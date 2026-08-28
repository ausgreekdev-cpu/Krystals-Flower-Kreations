import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';

const router = Router();
router.use(requireAuth, requireRole('admin','developer','maker','staff'));

router.post('/session/open', async (req, res) => {
  const session = await prisma.posSession.create({ data: { openedBy: req.user.id, location: req.body.location || 'Perth Studio', openingCash: req.body.openingCash || 0 } });
  res.status(201).json(session);
});

router.get('/session/current', async (req, res) => {
  const session = await prisma.posSession.findFirst({ where: { status: 'open' }, orderBy: { openedAt: 'desc' }, include: { payments: true } });
  res.json(session);
});

router.post('/session/:id/close', async (req, res) => {
  const { closingCash } = req.body;
  const session = await prisma.posSession.findUnique({ where: { id: req.params.id }, include: { payments: true } });
  if (!session) return res.status(404).json({ error: 'Not found' });
  const cashPayments = session.payments.filter(p => p.method === 'cash').reduce((a,b)=> a + Number(b.amount), 0);
  const expectedCash = Number(session.openingCash) + cashPayments;
  const variance = Number(closingCash) - expectedCash;
  const updated = await prisma.posSession.update({ where: { id: session.id }, data: { closedAt: new Date(), closingCash, expectedCash, variance, status: 'closed' } });
  res.json(updated);
});

// POS sale — creates order + payment + stock movement in one transaction
router.post('/sale', async (req, res) => {
  const { sessionId, items, paymentMethod = 'cash', email = 'pos@krystal.local', shippingName = 'POS Sale' } = req.body;
  // items: [{ productId, variantId, quantity }]
  let subtotal = 0;
  const enriched = [];
  for (const it of items) {
    const product = await prisma.product.findUnique({ where: { id: it.productId }, include: { variants: true } });
    const variant = it.variantId ? product.variants.find(v => v.id === it.variantId) : null;
    const price = variant ? Number(variant.price) : Number(product.price);
    subtotal += price * it.quantity;
    enriched.push({ ...it, price, title: variant ? `${product.title} — ${variant.title}` : product.title, sku: variant?.sku || product.sku });
  }
  const total = subtotal;
  const gst = total * 0.1 / 1.1;
  const order = await prisma.order.create({
    data: {
      orderNumber: `POS-${Date.now().toString().slice(-8)}`,
      email, shippingName, shippingSuburb: 'Perth', shippingState: 'WA', shippingPostcode: '6000',
      subtotal, shippingCost: 0, discountTotal: 0, taxTotal: gst, total,
      status: 'paid', paymentStatus: 'paid', paymentMethod,
      lines: { create: enriched.map(e => ({ productId: e.productId, variantId: e.variantId || null, title: e.title, sku: e.sku, quantity: e.quantity, unitPrice: e.price, lineTotal: e.price * e.quantity })) }
    }
  });
  await prisma.posPayment.create({ data: { sessionId, orderId: order.id, amount: total, method: paymentMethod } });
  // stock out
  for (const e of enriched) {
    const loc = await prisma.inventoryLocation.findFirst({ where: { isDefault: true } }) || await prisma.inventoryLocation.findFirst();
    if (loc) {
      await prisma.inventoryLevel.upsert({
        where: { productId_variantId_locationId: { productId: e.productId, variantId: e.variantId || null, locationId: loc.id } },
        create: { productId: e.productId, variantId: e.variantId || null, locationId: loc.id, onHand: -e.quantity },
        update: { onHand: { decrement: e.quantity } },
      });
      await prisma.stockMovement.create({ data: { productId: e.productId, variantId: e.variantId || null, locationId: loc.id, type: 'sale', quantity: -e.quantity, reference: order.orderNumber, userId: req.user.id } });
    }
  }
  res.status(201).json(order);
});

export default router;
