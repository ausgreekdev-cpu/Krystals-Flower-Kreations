import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';

const router = Router();

function getCartId(req) {
  return req.headers['x-cart-id'] || req.cookies?.cartId;
}

router.get('/', async (req, res) => {
  const cartId = getCartId(req);
  if (!cartId) return res.json({ cart: null, items: [] });
  const cart = await prisma.cart.findUnique({ where: { id: cartId }, include: { items: { include: { product: { include: { images: true } }, variant: true } } } });
  res.json(cart || { cart: null, items: [] });
});

router.post('/add', async (req, res) => {
  const schema = z.object({ productId: z.string(), variantId: z.string().optional().nullable(), quantity: z.number().int().min(1).default(1), cartId: z.string().optional().nullable() });
  const { productId, variantId, quantity, cartId: incomingId } = schema.parse(req.body);
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { variants: true } });
  if (!product || !product.isActive) return res.status(404).json({ error: 'Product not found' });
  const variant = variantId ? product.variants.find(v => v.id === variantId) : null;
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
});

router.post('/update', async (req, res) => {
  const schema = z.object({ itemId: z.string(), quantity: z.number().int().min(0) });
  const { itemId, quantity } = schema.parse(req.body);
  if (quantity === 0) await prisma.cartItem.delete({ where: { id: itemId } });
  else await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
  res.json({ ok: true });
});

router.delete('/:cartId', async (req, res) => {
  await prisma.cartItem.deleteMany({ where: { cartId: req.params.cartId } });
  await prisma.cart.delete({ where: { id: req.params.cartId } }).catch(()=>{});
  res.json({ ok: true });
});

export default router;
