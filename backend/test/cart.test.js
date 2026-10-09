import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';

let srv;
let trackedProductId;
let trackedSlug;
let trackedOnHand = 0;
let mtoProductId;
const createdCarts = [];

async function defaultLevelOnHand(productId) {
  const loc = await prisma.inventoryLocation.findFirst({ where: { isDefault: true } }) || await prisma.inventoryLocation.findFirst();
  if (!loc) return 0;
  const level = await prisma.inventoryLevel.findFirst({ where: { productId, variantId: null, locationId: loc.id } });
  return level ? level.onHand : 0;
}

async function addCart(productId, quantity, cartId) {
  const body = { productId, quantity };
  if (cartId) body.cartId = cartId;
  const res = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify(body) });
  const newCartId = res.body?.cartId || cartId;
  if (newCartId && !createdCarts.includes(newCartId)) createdCarts.push(newCartId);
  return { status: res.status, body: res.body, cartId: newCartId };
}

before(async () => {
  srv = await startServer();
  const { body } = await api(srv.base, '/api/products');
  const tracked = body.products.find(p => p.stockMode === 'tracked');
  const mto = body.products.find(p => p.slug === 'eucalyptus-paper-rose-bouquet-blush');
  assert.ok(tracked, 'a seeded tracked product');
  assert.ok(mto, 'a seeded made-to-order product');
  trackedProductId = tracked.id;
  trackedSlug = tracked.slug;
  mtoProductId = mto.id;
  trackedOnHand = await defaultLevelOnHand(trackedProductId);
  assert.ok(trackedOnHand >= 1, `tracked product has stock (got ${trackedOnHand})`);
  assert.ok(trackedOnHand < 99, 'stock low enough to exercise the cap');
});

after(async () => {
  for (const cartId of createdCarts) await api(srv.base, `/api/cart/${cartId}`, { method: 'DELETE' });
  await srv.close();
});

test('GET /api/products/:slug exposes availableQty for variantless tracked products', async () => {
  const { status, body } = await api(srv.base, `/api/products/${trackedSlug}`);
  assert.equal(status, 200);
  assert.equal(body.availableQty, trackedOnHand, 'product page can enable Add to Cart with real stock');
});

test('cart add beyond available stock is rejected', async () => {
  const { status, body } = await addCart(trackedProductId, trackedOnHand + 1);
  assert.equal(status, 422, JSON.stringify(body));
  assert.equal(body.code, 'out_of_stock');
  assert.equal(body.available, trackedOnHand);
});

test('cart update cannot raise a line above available stock', async () => {
  const { body: added, cartId } = await addCart(trackedProductId, 1);
  assert.ok(cartId);
  const itemId = added.cart.items.find(l => l.productId === trackedProductId).id;
  const over = await api(srv.base, '/api/cart/update', {
    method: 'POST',
    body: JSON.stringify({ itemId, cartId, quantity: trackedOnHand + 1 }),
  });
  assert.equal(over.status, 422, JSON.stringify(over.body));
  assert.equal(over.body.code, 'out_of_stock');
  const exact = await api(srv.base, '/api/cart/update', {
    method: 'POST',
    body: JSON.stringify({ itemId, cartId, quantity: trackedOnHand }),
  });
  assert.equal(exact.status, 200, JSON.stringify(exact.body));
});

test('repeated adds clamp the line quantity at 99', async () => {
  const first = await addCart(mtoProductId, 60);
  assert.equal(first.status, 200);
  const second = await addCart(mtoProductId, 60, first.cartId);
  assert.equal(second.status, 200);
  const { body: cart } = await api(srv.base, '/api/cart/', { headers: { 'X-Cart-Id': first.cartId } });
  const line = cart.items.find(l => l.productId === mtoProductId);
  assert.equal(line.quantity, 99);
});

test('update quantity 0 removes the line', async () => {
  const { body: added, cartId } = await addCart(mtoProductId, 2);
  const itemId = added.cart.items.find(l => l.productId === mtoProductId).id;
  const res = await api(srv.base, '/api/cart/update', {
    method: 'POST',
    body: JSON.stringify({ itemId, cartId, quantity: 0 }),
  });
  assert.equal(res.status, 200);
  const { body: cart } = await api(srv.base, '/api/cart/', { headers: { 'X-Cart-Id': cartId } });
  assert.ok(!cart.items.some(l => l.id === itemId), 'line deleted');
});
