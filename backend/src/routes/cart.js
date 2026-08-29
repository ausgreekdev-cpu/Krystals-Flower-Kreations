import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { validate } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();

// Per-cart stricter limit: 20/min per IP
const cartAddLimit = rateLimit('cart_add', 20, 1);

function getCartId(req) {
  return req.headers['x-cart-id'] || req.cookies?.cartId;
}

router.get('/', async (req, res) => {
  const cartId = getCartId(req);
  if (!cartId) return res.json({ cart: null, items: [] });
  const cart = await prisma.cart.findUnique({ where: { id: cartId }, include: { items: { include: { product: { include: { images: true } }, variant: true } } } });
  res.json(cart || { cart: null, items: [] });
});

router.post('/add', cartAddLimit, validate(z.object({ productId: z.string().min(8).max(100), variantId: z.string().min(8).max(100).optional().nullable(), quantity: z.number().int().finite().min(1).max(99).default(1), cartId: z.string().min(8).max(100).optional().nullable() })), asyncHandler(async (req, res) => {
  const { productId, variantId, quantity, cartId: incomingId } = req.validated;
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { variants: true } });
  if (!product || !product.isActive) return res.status(404).json({ error: 'Product not found', code: 'not_found' });
  const variant = variantId ? product.variants.find(v => v.id === variantId) : null;
  if (variantId && !variant) return res.status(404).json({ error: 'Variant not found', code: 'not_found' });
  // Inventory check for tracked physical variants
  if (variant && product.stockMode === 'tracked') {
    // variant.inventoryQuantity is atomic stock (added in migration)
    const available = variant.inventoryQuantity ?? 0;
    // Also consider existing cart qty for this variant
    const incomingCartIdCheck = incomingId || getCartId(req);
    let existingQty = 0;
    if (incomingCartIdCheck) {
      const existing = await prisma.cartItem.findFirst({ where: { cartId: incomingCartIdCheck, productId, variantId: variantId || null } });
      if (existing) existingQty = existing.quantity;
    }
    if (available < quantity + existingQty) {
      return res.status(422).json({ error: `Only ${available} in stock`, code: 'out_of_stock', available, requested: quantity });
    }
  }
  const price = variant ? Number(variant.price) : Number(product.price);

  let cartId = incomingId || getCartId(req);
  let cart = cartId ? await prisma.cart.findUnique({ where: { id: cartId } }) : null;
  if (!cart) {
    cart = await prisma.cart.create({ data: { sessionId: `sess_${Date.now()}_${Math.random().toString(36).slice(2,8)}` } });
    cartId = cart.id;
  }
  const existing = await prisma.cartItem.findFirst({ where: { cartId, productId, variantId: variantId || null } });
  if (existing) {
    await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: existing.quantity + quantity } });
  } else {
    await prisma.cartItem.create({ data: { cartId, productId, variantId: variantId || null, quantity, priceSnapshot: price } });
  }
  const full = await prisma.cart.findUnique({ where: { id: cartId }, include: { items: { include: { product: { include: { images: true } }, variant: true } } } });
  res.json({ cartId, cart: full });
}));

router.post('/update', validate(z.object({ itemId: z.string().min(8).max(100), quantity: z.number().int().finite().min(0).max(99) })), asyncHandler(async (req, res) => {
  const { itemId, quantity } = req.validated;
  if (quantity === 0) await prisma.cartItem.delete({ where: { id: itemId } });
  else await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
  res.json({ ok: true });
}));

router.delete('/:cartId', async (req, res) => {
  await prisma.cartItem.deleteMany({ where: { cartId: req.params.cartId } });
  await prisma.cart.delete({ where: { id: req.params.cartId } }).catch(()=>{});
  res.json({ ok: true });
});

export default router;
