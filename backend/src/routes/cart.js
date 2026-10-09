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

// Bump Cart.updatedAt so the hourly stale-cart cleanup doesn't delete active carts
// (CartItem writes don't touch Cart.updatedAt on their own).
async function touchCart(cartId) {
  await prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } }).catch(()=>{});
}

// Available stock for a tracked product: variant inventory when the line has a
// variant, otherwise the default-location InventoryLevel (same sources the
// checkout transaction checks).
async function trackedAvailable({ variant, productId }) {
  if (variant) return variant.inventoryQuantity ?? 0;
  const loc = await prisma.inventoryLocation.findFirst({ where: { isDefault: true } }) || await prisma.inventoryLocation.findFirst();
  if (!loc) return 0;
  const level = await prisma.inventoryLevel.findFirst({ where: { productId, variantId: null, locationId: loc.id } });
  return level ? level.onHand : 0;
}

function stockError(available, requested) {
  return { status: 422, body: { error: `Only ${available} in stock`, code: 'out_of_stock', available, requested } };
}

router.get('/', asyncHandler(async (req, res) => {
  const cartId = getCartId(req);
  if (!cartId) return res.json({ cart: null, items: [] });
  const cart = await prisma.cart.findUnique({ where: { id: cartId }, include: { items: { include: { product: { include: { images: true } }, variant: true } } } });
  res.json(cart || { cart: null, items: [] });
}));

router.post('/add', cartAddLimit, validate(z.object({ productId: z.string().min(8).max(100), variantId: z.string().min(8).max(100).optional().nullable(), quantity: z.number().int().finite().min(1).max(99).default(1), cartId: z.string().min(8).max(100).optional().nullable() })), asyncHandler(async (req, res) => {
  const { productId, variantId, quantity, cartId: incomingId } = req.validated;
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { variants: true } });
  if (!product || !product.isActive) return res.status(404).json({ error: 'Product not found', code: 'not_found' });
  const variant = variantId ? product.variants.find(v => v.id === variantId) : null;
  if (variantId && !variant) return res.status(404).json({ error: 'Variant not found', code: 'not_found' });

  const cartIdIn = incomingId || getCartId(req);
  const existing = cartIdIn ? await prisma.cartItem.findFirst({ where: { cartId: cartIdIn, productId, variantId: variantId || null } }) : null;

  // Stock check for tracked products (variant inventory or default-location
  // level), counting what's already on this cart's line — mirrors checkout.
  if (product.stockMode === 'tracked') {
    const available = await trackedAvailable({ variant, productId });
    const requestedTotal = (existing ? existing.quantity : 0) + quantity;
    if (available < requestedTotal) {
      const { status, body } = stockError(available, quantity);
      return res.status(status).json(body);
    }
  }
  const price = variant ? Number(variant.price) : Number(product.price);

  let cartId = cartIdIn;
  let cart = cartId ? await prisma.cart.findUnique({ where: { id: cartId } }) : null;
  if (!cart) {
    cart = await prisma.cart.create({ data: { sessionId: `sess_${Date.now()}_${Math.random().toString(36).slice(2,8)}` } });
    cartId = cart.id;
  }
  if (existing) {
    // One line caps at 99 (matches the zod max and the UI stepper).
    await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: Math.min(99, existing.quantity + quantity) } });
  } else {
    await prisma.cartItem.create({ data: { cartId, productId, variantId: variantId || null, quantity, priceSnapshot: price } });
  }
  await touchCart(cartId);
  const full = await prisma.cart.findUnique({ where: { id: cartId }, include: { items: { include: { product: { include: { images: true } }, variant: true } } } });
  res.json({ cartId, cart: full });
}));

router.post('/update', validate(z.object({ itemId: z.string().min(8).max(100), cartId: z.string().min(8).max(100), quantity: z.number().int().finite().min(0).max(99) })), asyncHandler(async (req, res) => {
  const { itemId, cartId, quantity } = req.validated;
  // Ownership: the item must belong to the caller's cart (cartId is the guest capability)
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId }, include: { product: true, variant: true } });
  if (!item) return res.status(404).json({ error: 'Item not found in cart', code: 'not_found' });
  // Raising a line above available stock must fail here, not at checkout.
  if (quantity > 0 && item.product?.stockMode === 'tracked') {
    const available = await trackedAvailable({ variant: item.variant, productId: item.productId });
    if (quantity > available) {
      const { status, body } = stockError(available, quantity);
      return res.status(status).json(body);
    }
  }
  if (quantity === 0) await prisma.cartItem.delete({ where: { id: itemId } });
  else await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
  await touchCart(cartId);
  res.json({ ok: true });
}));

router.delete('/:cartId', asyncHandler(async (req, res) => {
  await prisma.cartItem.deleteMany({ where: { cartId: req.params.cartId } });
  await prisma.cart.delete({ where: { id: req.params.cartId } }).catch(()=>{});
  res.json({ ok: true });
}));

export default router;
