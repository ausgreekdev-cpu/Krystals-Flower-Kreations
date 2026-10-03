import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';

let srv;
let token;
let product;
let location;
let session;
let variant;
const orderIds = [];
const uniq = Date.now().toString(36);

const auth = () => ({ Authorization: `Bearer ${token}` });

async function readLevel() {
  const l = await prisma.inventoryLevel.findFirst({ where: { productId: product.id, variantId: null, locationId: location.id } });
  return l ? l.onHand : null;
}

before(async () => {
  srv = await startServer();
  const login = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  assert.equal(login.status, 200, 'seeded developer login');
  token = login.body.token;

  // Fresh tracked product with controlled stock for the sale tests.
  const created = await api(srv.base, '/api/products', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({
      title: `POS test ${uniq}`,
      slug: `pos-test-${uniq}`,
      price: 25,
      type: 'physical',
      stockMode: 'tracked',
      barcode: `POSBC${uniq}`,
      sku: `POSSKU${uniq}`,
    }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  product = created.body;

  location = await prisma.inventoryLocation.findFirst({ where: { isDefault: true } }) || await prisma.inventoryLocation.findFirst();
  assert.ok(location, 'seeded inventory location needed');
  const existing = await prisma.inventoryLevel.findFirst({ where: { productId: product.id, variantId: null, locationId: location.id } });
  if (existing) await prisma.inventoryLevel.update({ where: { id: existing.id }, data: { onHand: 5 } });
  else await prisma.inventoryLevel.create({ data: { productId: product.id, variantId: null, locationId: location.id, onHand: 5 } });

  // A prior crashed run must not leave an open till behind.
  await prisma.posSession.updateMany({ where: { status: 'open' }, data: { status: 'closed', closedAt: new Date() } }).catch(() => {});
});

after(async () => {
  if (orderIds.length) {
    await prisma.posPayment.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => {});
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {});
  }
  if (variant) await prisma.productVariant.delete({ where: { id: variant.id } }).catch(() => {});
  if (product) await prisma.product.delete({ where: { id: product.id } }).catch(() => {});
  await prisma.posSession.updateMany({ where: { status: 'open' }, data: { status: 'closed', closedAt: new Date() } }).catch(() => {});
  await srv.close();
});

test('open till returns201 and current session includes payments', async () => {
  const open = await api(srv.base, '/api/pos/session/open', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ location: 'Perth Studio' }),
  });
  assert.equal(open.status, 201, JSON.stringify(open.body));
  assert.equal(open.body.status, 'open');
  session = open.body;

  const cur = await api(srv.base, '/api/pos/session/current', { headers: auth() });
  assert.equal(cur.status, 200);
  assert.equal(cur.body.id, session.id);
  assert.ok(Array.isArray(cur.body.payments), 'current session includes payments');
});

test('POS sale decrements product stock once and replays are idempotent', async () => {
  assert.equal(await readLevel(), 5, 'stock starts at 5');
  const body = {
    sessionId: session.id,
    items: [{ productId: product.id, quantity: 2 }],
    paymentMethod: 'cash',
  };
  const first = await api(srv.base, '/api/pos/sale', {
    method: 'POST',
    headers: { ...auth(), 'Idempotency-Key': `idem-${uniq}-1` },
    body: JSON.stringify(body),
  });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  orderIds.push(first.body.id);
  assert.equal(await readLevel(), 3, 'stock decremented exactly once (2 of 5)');
  assert.equal(Number(first.body.lines[0].unitPrice), 25, 'non-variant line sells at product price');

  // Replay — same key must return the original order without touching stock or payments.
  const replay = await api(srv.base, '/api/pos/sale', {
    method: 'POST',
    headers: { ...auth(), 'Idempotency-Key': `idem-${uniq}-1` },
    body: JSON.stringify(body),
  });
  assert.ok([200, 201].includes(replay.status), `replay status ${replay.status}`);
  assert.equal(replay.body.id, first.body.id, 'replay returns the original order');
  assert.equal(await readLevel(), 3, 'stock untouched by replay');

  const cur = await api(srv.base, '/api/pos/session/current', { headers: auth() });
  const cash = cur.body.payments.filter(p => p.method === 'cash').reduce((a, p) => a + Number(p.amount), 0);
  assert.equal(cash, 50, 'exactly one payment recorded for the idempotent pair');
});

test('out-of-stock POS sale returns 422 and rolls back', async () => {
  await prisma.inventoryLevel.updateMany({ where: { productId: product.id, variantId: null, locationId: location.id }, data: { onHand: 1 } });
  const ordersBefore = await prisma.order.count();
  const res = await api(srv.base, '/api/pos/sale', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ sessionId: session.id, items: [{ productId: product.id, quantity: 2 }], paymentMethod: 'eftpos' }),
  });
  assert.equal(res.status, 422, JSON.stringify(res.body));
  assert.equal(res.body.code, 'out_of_stock');
  assert.equal(await readLevel(), 1, 'stock unchanged after rollback');
  assert.equal(await prisma.order.count(), ordersBefore, 'no order created');
});

test('variant scan returns variant price and variant sale decrements variant stock', async () => {
  variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      title: `Option A ${uniq}`,
      sku: `POSVAR${uniq}`,
      barcode: `POSBV${uniq}`,
      price: 30,
      inventoryQuantity: 3,
    },
  });

  const scan = await api(srv.base, `/api/inventory/scan/${variant.barcode}`, { headers: auth() });
  assert.equal(scan.status, 200, JSON.stringify(scan.body));
  assert.equal(scan.body.kind, 'variant');
  assert.equal(scan.body.variant.price, 30, 'scan payload carries the variant price');

  const res = await api(srv.base, '/api/pos/sale', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ sessionId: session.id, items: [{ productId: product.id, variantId: variant.id, quantity: 1 }], paymentMethod: 'eftpos' }),
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  orderIds.push(res.body.id);
  assert.equal(Number(res.body.lines[0].unitPrice), 30, 'variant line sells at variant price');
  assert.equal(res.body.lines[0].variantId, variant.id, 'line records the variant');

  const v = await prisma.productVariant.findUnique({ where: { id: variant.id } });
  assert.equal(v.inventoryQuantity, 2, 'variant stock decremented');
});

test('close till returns Z-report with payments and zero variance', async () => {
  const cur = await api(srv.base, '/api/pos/session/current', { headers: auth() });
  const expected = Number(cur.body.openingCash) + cur.body.payments.filter(p => p.method === 'cash').reduce((a, p) => a + Number(p.amount), 0);

  const close = await api(srv.base, `/api/pos/session/${session.id}/close`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ closingCash: expected }),
  });
  assert.equal(close.status, 200, JSON.stringify(close.body));
  assert.equal(close.body.status, 'closed');
  assert.ok(Array.isArray(close.body.payments), 'close response includes payments for the Z-report');
  assert.ok(close.body.payments.length >= 2, 'payments from this till session are present');
  assert.equal(Number(close.body.expectedCash), expected);
  assert.equal(Number(close.body.variance), 0, 'counted == expected → zero variance');

  const byMethod = {};
  close.body.payments.forEach(p => { byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount); });
  assert.equal(byMethod.cash, 50, 'cash takings = the idempotent sale');
  assert.equal(byMethod.eftpos, 30, 'eftpos takings = the variant sale');

  const after = await api(srv.base, '/api/pos/session/current', { headers: auth() });
  assert.ok(!after.body || !after.body.id, 'no till left open');
});
