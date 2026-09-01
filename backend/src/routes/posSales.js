import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { rateLimit } from '../middleware/rate-limit.js';

const router = Router();
const requireAuth = authenticate;
router.use(requireAuth, requireRole('admin','developer','maker','staff'));
const posLimit = rateLimit('pos_sale', 30, 1);

const saleSchema = z.object({
  sessionId: z.string().min(8).max(100).optional().nullable(),
  items: z.array(z.object({ productId: z.string().min(8).max(100), variantId: z.string().min(8).max(100).optional().nullable(), quantity: z.number().int().finite().min(1).max(99) })).min(1).max(20),
  paymentMethod: z.enum(['cash','eftpos','bank_transfer','card']).default('cash'),
  email: z.string().email().max(254).default('pos@krystal.local'),
  shippingName: z.string().max(120).default('POS Sale'),
}).strict();

router.post('/', posLimit, validate(saleSchema), asyncHandler(async (req, res) => {
  const { sessionId, items, paymentMethod, email, shippingName } = req.validated;
  const idempotencyKey = req.headers['idempotency-key'] ? String(req.headers['idempotency-key']).slice(0,100) : null;
  if (idempotencyKey) {
    const existing = await prisma.order.findUnique({ where: { idempotencyKey } });
    if (existing) return res.json(existing);
  }
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
  const order = await prisma.$transaction(async (tx) => {
    for (const e of enriched) {
      if (e.variantId && e.variant) {
        const prod = await tx.product.findUnique({ where: { id: e.productId }, select: { stockMode: true } });
        if (prod?.stockMode === 'tracked') {
          const upd = await tx.productVariant.updateMany({ where: { id: e.variantId, inventoryQuantity: { gte: e.quantity } }, data: { inventoryQuantity: { decrement: e.quantity } } });
          if (upd.count === 0) {
            const v = await tx.productVariant.findUnique({ where: { id: e.variantId } });
            throw Object.assign(new Error(`Insufficient stock for ${v?.title}: only ${v?.inventoryQuantity ?? 0} left`), { status: 422, code: 'out_of_stock' });
          }
          await tx.inventoryLedger.create({ data: { variantId: e.variantId, delta: -e.quantity, reason: 'sale', orderId: 'pending_pos', userId: req.user.id } });
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
    await tx.inventoryLedger.updateMany({ where: { orderId: 'pending_pos' }, data: { orderId: created.id } }).catch(()=>{});
    if (sessionId) await tx.posPayment.create({ data: { sessionId, orderId: created.id, amount: total, method: paymentMethod } });
    for (const e of enriched) {
      const loc = await tx.inventoryLocation.findFirst({ where: { isDefault: true } }) || await tx.inventoryLocation.findFirst();
      if (loc) {
        await tx.inventoryLevel.upsert({ where: { productId_variantId_locationId: { productId: e.productId, variantId: e.variantId || null, locationId: loc.id } }, create: { productId: e.productId, variantId: e.variantId || null, locationId: loc.id, onHand: -e.quantity }, update: { onHand: { decrement: e.quantity } } });
        await tx.stockMovement.create({ data: { productId: e.productId, variantId: e.variantId || null, locationId: loc.id, type: 'sale', quantity: -e.quantity, reference: created.orderNumber, userId: req.user.id } });
      }
    }
    try {
      const pts = Math.floor(Number(total));
      if (pts>0) {
        let acc = await tx.loyaltyAccount.findUnique({ where: { email } });
        if (!acc) acc = await tx.loyaltyAccount.create({ data: { email, points: 0, tier: 'seedling' } });
        const newPoints = acc.points + pts;
        const tier = newPoints >= 500 ? 'garden' : newPoints >= 100 ? 'blossom' : 'seedling';
        await tx.loyaltyAccount.update({ where: { id: acc.id }, data: { points: newPoints, tier } });
        await tx.loyaltyTransaction.create({ data: { accountId: acc.id, pointsDelta: pts, reason: 'purchase', orderId: created.id } });
      }
    } catch {}
    return created;
  });
  res.status(201).json(order);
}));

export default router;
