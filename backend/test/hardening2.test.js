import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';

// Batch C regression tests: soft deletes, validation, checkout price re-check.
let srv;
let adminToken;

before(async () => {
  srv = await startServer();
  const admin = await api(srv.base, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }) });
  adminToken = admin.body.token;
});
after(async () => { await srv.close(); });

test('soft-deleting a product hides it from the storefront', async () => {
  const slug = `soft-del-${Date.now()}`;
  const created = await api(srv.base, '/api/products', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ title: 'Soft Delete Test', slug, description: 'x', type: 'physical', stockMode: 'made_to_order', price: 10 }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.id;
  // visible publicly first
  const before = await api(srv.base, `/api/products/${slug}`);
  assert.equal(before.status, 200);
  // soft delete
  const del = await api(srv.base, `/api/products/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(del.status, 200);
  // gone from public list + detail
  const after = await api(srv.base, `/api/products/${slug}`);
  assert.equal(after.status, 404);
});

test('discount delete is a soft delete (hidden from admin list)', async () => {
  const code = `SOFT${Date.now().toString().slice(-6)}`;
  const created = await api(srv.base, '/api/discounts/admin', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ code, type: 'percent', value: 5 }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const del = await api(srv.base, `/api/discounts/admin/${created.body.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(del.status, 200);
  const list = await api(srv.base, '/api/discounts/admin', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.ok(!list.body.some((d) => d.code === code), 'soft-deleted discount is not listed');
  // and it no longer validates at checkout
  const v = await api(srv.base, `/api/discounts/validate?code=${code}`);
  assert.equal(v.body.valid, false);
});

test('stocktake rejects lines missing countedQty', async () => {
  const { status } = await api(srv.base, '/api/inventory/stocktake', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ locationId: 'studio-perth', items: [{ productId: 'someproductid123' }] }),
  });
  assert.equal(status, 400);
});

test('transfer rejects same source and destination', async () => {
  const { status } = await api(srv.base, '/api/inventory/transfer', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ productId: 'someproductid123', fromLocationId: 'studio-perth', toLocationId: 'studio-perth', quantity: 5 }),
  });
  assert.equal(status, 400);
});

test('movements rejects an invalid from date', async () => {
  const { status } = await api(srv.base, '/api/inventory/movements?from=not-a-date', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(status, 400);
});

test('checkout uses current price, not the stale cart snapshot', async () => {
  // create a product, add to cart at price X, then change price to Y, checkout should bill Y
  const slug = `price-recheck-${Date.now()}`;
  const created = await api(srv.base, '/api/products', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ title: 'Price Recheck', slug, description: 'x', type: 'physical', stockMode: 'made_to_order', price: 20 }),
  });
  const productId = created.body.id;
  const { body: cartRes } = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity: 1 }) });
  const cartId = cartRes.cartId || cartRes.cart?.id;
  // bump price
  await api(srv.base, `/api/products/${productId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ price: 55 }) });
  const co = await api(srv.base, '/api/orders/checkout', {
    method: 'POST',
    body: JSON.stringify({ cartId, email: `recheck_${Date.now()}@test.com`, shippingName: 'Recheck Buyer', shippingAddress: '1 Test St', shippingSuburb: 'Perth', shippingState: 'WA', shippingPostcode: '6000', paymentMethod: 'bank_transfer' }),
  });
  assert.equal(co.status, 200, JSON.stringify(co.body).slice(0, 300));
  const line = co.body.order.lines[0];
  assert.equal(Number(line.unitPrice), 55);
});
