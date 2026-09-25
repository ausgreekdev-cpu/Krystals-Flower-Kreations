import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';

// Coverage for POS flow, bookings list, and admin CRUD (products/discounts).
let srv;
let adminToken;

before(async () => {
  srv = await startServer();
  const admin = await api(srv.base, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }) });
  adminToken = admin.body.token;
});
after(async () => { await srv.close(); });

test('POS: open till, make a sale, close till', async () => {
  const open = await api(srv.base, '/api/pos/session/open', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ location: 'Perth Studio', openingCash: 50 }),
  });
  assert.equal(open.status, 201, JSON.stringify(open.body));
  const sessionId = open.body.id;

  const { body: products } = await api(srv.base, '/api/products');
  const p = products.products.find((x) => x.stockMode === 'made_to_order') || products.products[0];
  const sale = await api(srv.base, '/api/pos/sale', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ sessionId, items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'cash' }),
  });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));
  assert.equal(sale.body.status, 'paid');
  assert.equal(typeof sale.body.receiptFooter, 'string', 'sale response carries the receipt footer setting');

  const close = await api(srv.base, `/api/pos/session/${sessionId}/close`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ closingCash: Number(sale.body.total) + 50 }),
  });
  assert.equal(close.status, 200, JSON.stringify(close.body));
  assert.equal(close.body.status, 'closed');
});

test('bookings list is staff-only and returns an array', async () => {
  const noAuth = await api(srv.base, '/api/bookings');
  assert.equal(noAuth.status, 401);
  const list = await api(srv.base, '/api/bookings', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body));
});

test('product admin CRUD: create, update, soft-delete', async () => {
  const slug = `crud-${Date.now()}`;
  const created = await api(srv.base, '/api/products', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ title: 'CRUD Test', slug, description: 'x', type: 'physical', stockMode: 'made_to_order', price: 30 }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.id;
  const updated = await api(srv.base, `/api/products/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ price: 42 }) });
  assert.equal(updated.status, 200);
  assert.equal(Number(updated.body.price), 42);
  const del = await api(srv.base, `/api/products/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(del.status, 200);
  const gone = await api(srv.base, `/api/products/${slug}`);
  assert.equal(gone.status, 404);
});

test('discount admin CRUD: create, list, soft-delete', async () => {
  const code = `CRUD${Date.now().toString().slice(-6)}`;
  const created = await api(srv.base, '/api/discounts/admin', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ code, type: 'fixed', value: 10 }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const list = await api(srv.base, '/api/discounts/admin', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.ok(list.body.some((d) => d.code === code));
  const del = await api(srv.base, `/api/discounts/admin/${created.body.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(del.status, 200);
  const after = await api(srv.base, '/api/discounts/admin', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.ok(!after.body.some((d) => d.code === code));
});

test('discount admin rejects duplicate code', async () => {
  const code = `DUP${Date.now().toString().slice(-6)}`;
  await api(srv.base, '/api/discounts/admin', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ code, type: 'percent', value: 5 }) });
  const dup = await api(srv.base, '/api/discounts/admin', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ code, type: 'percent', value: 5 }) });
  assert.equal(dup.status, 409);
});
