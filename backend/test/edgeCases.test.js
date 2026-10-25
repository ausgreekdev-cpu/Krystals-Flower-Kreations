import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';

// Launch checklist — boundary conditions: emoji/special characters in gift
// notes, maximum stem counts, cart quantity edges.

let srv;
let productId;
const createdOrderNumbers = [];

before(async () => {
  srv = await startServer();
  const { body } = await api(srv.base, '/api/products');
  productId = body.products.find((p) => p.slug === 'eucalyptus-paper-rose-bouquet-blush').id;
});

after(async () => {
  await srv.close();
  const orders = await prisma.order.findMany({ where: { orderNumber: { in: createdOrderNumbers } }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  if (ids.length) {
    await prisma.orderLine.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.customArtOrder.deleteMany({ where: { customerEmail: { endsWith: '@test.com' } } }).catch(() => {});
});

function checkoutBody(note, extra = {}) {
  return {
    email: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`,
    shippingName: 'Edge Tester', shippingAddress: '9 Boundary St',
    shippingSuburb: 'Perth', shippingState: 'WA', shippingPostcode: '6000',
    paymentMethod: 'bank_transfer',
    ...(note !== undefined ? { customerNote: note } : {}),
    ...extra,
  };
}

test('gift notes survive emoji, quotes, RTL and angle brackets intact', async () => {
  const note = 'Please hide the invoice 🎁✨ — from "Bōb" & <b>Sue</b> <script>alert(1)</script> \u{1F490} \u{1F600}\nالعربية עברית · %00 \\n done';
  const add = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity: 1 }) });
  assert.equal(add.status, 200);
  const cartId = add.body.cartId || add.body.cart?.id;
  const { status, body } = await api(srv.base, '/api/orders/checkout', {
    method: 'POST',
    body: JSON.stringify({ ...checkoutBody(note), cartId }),
  });
  assert.equal(status, 200, JSON.stringify(body).slice(0, 300));
  createdOrderNumbers.push(body.order.orderNumber);
  const order = await prisma.order.findUnique({ where: { orderNumber: body.order.orderNumber } });
  assert.equal(order.customerNote, note, 'note round-trips byte-for-byte (rendering escapes, storage must not mangle)');
});

test('gift notes accept the 2000-char maximum and reject 2001', async () => {
  const add1 = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity: 1 }) });
  // zod .max(2000) counts UTF-16 units — '🎉' is 2, so 1998 + emoji = 2000
  const ok = await api(srv.base, '/api/orders/checkout', {
    method: 'POST',
    body: JSON.stringify({ ...checkoutBody('x'.repeat(1998) + '🎉'), cartId: add1.body.cartId || add1.body.cart?.id }),
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body).slice(0, 300));
  createdOrderNumbers.push(ok.body.order.orderNumber);

  const add2 = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity: 1 }) });
  const over = await api(srv.base, '/api/orders/checkout', {
    method: 'POST',
    body: JSON.stringify({ ...checkoutBody('x'.repeat(2001)), cartId: add2.body.cartId || add2.body.cart?.id }),
  });
  assert.equal(over.status, 400, 'over-length note rejected');
});

test('cart quantity edges: 1 and 99 pass, 0 and 100 reject on add', async () => {
  const min = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity: 1 }) });
  assert.equal(min.status, 200);
  const cartId = min.body.cartId || min.body.cart?.id;
  const max = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity: 99, cartId }) });
  assert.equal(max.status, 200, JSON.stringify(max.body).slice(0, 200));
  const line = (max.body.cart?.items || []).find((l) => l.productId === productId);
  assert.ok(line.quantity <= 99, 'accumulation clamps at 99');

  const zero = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity: 0 }) });
  assert.equal(zero.status, 400, 'quantity 0 rejected');
  const hundred = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity: 100 }) });
  assert.equal(hundred.status, 400, 'quantity 100 rejected');
});

test('custom order stem counts: 25 (max) and 1 accepted, 0 and 26 rejected', async () => {
  const spec = (n) => ({ paperColor: 'Blush', paperTexture: 'textured', weight: '65lb', stemCount: n, heightMm: 350, templateId: 'wattle-sprig' });
  const max = await api(srv.base, '/api/custom-orders', {
    method: 'POST',
    body: JSON.stringify({ customerEmail: 'edge_stems@test.com', customerName: 'Edge Stems', spec: spec(25) }),
  });
  assert.equal(max.status, 201, JSON.stringify(max.body).slice(0, 300));
  const min = await api(srv.base, '/api/custom-orders', {
    method: 'POST',
    body: JSON.stringify({ customerEmail: 'edge_stems_min@test.com', customerName: 'Edge Min', spec: spec(1) }),
  });
  assert.equal(min.status, 201, JSON.stringify(min.body).slice(0, 300));
  const zero = await api(srv.base, '/api/custom-orders', {
    method: 'POST',
    body: JSON.stringify({ customerEmail: 'edge_zero@test.com', customerName: 'Edge Zero', spec: spec(0) }),
  });
  assert.equal(zero.status, 400, 'stemCount 0 rejected');
  const over = await api(srv.base, '/api/custom-orders', {
    method: 'POST',
    body: JSON.stringify({ customerEmail: 'edge_over@test.com', customerName: 'Edge Over', spec: spec(26) }),
  });
  assert.equal(over.status, 400, 'stemCount 26 rejected');
});

test('custom order price scales past the stem cap without NaN on add-ons', async () => {
  const { status, body } = await api(srv.base, '/api/custom-orders', {
    method: 'POST',
    body: JSON.stringify({
      customerEmail: 'edge_addons@test.com', customerName: 'Edge Addons',
      spec: { paperColor: 'Ivory', paperTexture: 'smooth', weight: '80lb', stemCount: 25, heightMm: 500, templateId: 'paper-rose', addGreenery: true, vaseIncluded: true, domeIncluded: true, ledIncluded: true, palette: 'romantic-blush' },
    }),
  });
  assert.equal(status, 201, JSON.stringify(body).slice(0, 300));
  assert.ok(Number.isFinite(Number(body.totalPrice)), 'total is a finite number');
  assert.ok(Number(body.totalPrice) > 0, 'positive total');
});
