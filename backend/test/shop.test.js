import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

test('GET /api/products lists seeded products with placeholder images', async () => {
  const { status, body } = await api(srv.base, '/api/products');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.products));
  assert.ok(body.products.length >= 8);
  const rose = body.products.find((p) => p.slug === 'eucalyptus-paper-rose-bouquet-blush');
  assert.ok(rose, 'seed rose product exists');
  assert.equal(Number(rose.price), 89);
  assert.ok(rose.images?.length > 0, 'product has an image');
  assert.equal(rose.images[0].url, '/placeholder-bloom.jpg');
});

test('GET /api/products/:slug returns single product', async () => {
  const { status, body } = await api(srv.base, '/api/products/eucalyptus-paper-rose-bouquet-blush');
  assert.equal(status, 200);
  assert.equal(body.title, 'Eucalyptus Paper Rose Bouquet — Blush');
  assert.equal(body.cricutCompatible, true);
});

test('GET /api/collections returns seeded collections', async () => {
  const { status, body } = await api(srv.base, '/api/collections');
  assert.equal(status, 200);
  const arr = Array.isArray(body) ? body : body.collections;
  assert.ok(Array.isArray(arr));
  assert.ok(arr.some((c) => c.slug === 'paper-bouquets'));
});

test('discounts expose BLOOM10 and PERTHFREE via validate', async () => {
  const { status, body } = await api(srv.base, '/api/discounts/validate?code=BLOOM10&subtotal=100');
  assert.equal(status, 200);
  assert.equal(body.valid, true, 'BLOOM10 is valid above min spend');
  assert.equal(body.discount.code, 'BLOOM10');
  assert.equal(body.discount.type, 'percent');
  const { body: belowMin } = await api(srv.base, '/api/discounts/validate?code=BLOOM10&subtotal=10');
  assert.equal(belowMin.valid, false, 'BLOOM10 invalid below min spend');
  const { body: pert } = await api(srv.base, '/api/discounts/validate?code=PERTHFREE&subtotal=120');
  assert.equal(pert.valid, true, 'PERTHFREE is valid above min spend');
  assert.equal(pert.discount.type, 'fixed');
  const { body: bad } = await api(srv.base, '/api/discounts/validate?code=NOPE');
  assert.equal(bad.valid, false);
});