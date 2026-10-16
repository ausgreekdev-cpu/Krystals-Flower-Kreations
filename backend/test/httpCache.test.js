import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';

// Cache policy contract: public reads are CDN/browser cacheable, everything
// personalized (staff views, carts) is no-store. The apiCache edge function
// keys its CDN cache on these headers — without `public` it never stores.
let srv;
let adminToken;
let productId;

before(async () => {
  srv = await startServer();
  const login = await api(srv.base, '/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  assert.equal(login.status, 200);
  adminToken = login.body.token;
  const { body } = await api(srv.base, '/api/products?limit=5');
  productId = body.products[0]?.id;
  assert.ok(productId, 'seeded product available');
});
after(async () => { await srv.close(); });

test('public product reads are cacheable', async () => {
  const list = await api(srv.base, '/api/products?limit=5');
  assert.equal(list.status, 200);
  assert.match(list.headers.get('cache-control') || '', /public/);

  const detail = await api(srv.base, '/api/products/eucalyptus-paper-rose-bouquet-blush');
  assert.equal(detail.status, 200);
  assert.match(detail.headers.get('cache-control') || '', /public/);
});

test('staff views are never cacheable', async () => {
  const staffList = await api(srv.base, '/api/products?limit=5&all=1', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(staffList.status, 200);
  assert.ok(!/public/.test(staffList.headers.get('cache-control') || ''), 'staff list not public-cacheable');

  const staffDetail = await api(srv.base, '/api/products/eucalyptus-paper-rose-bouquet-blush', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(staffDetail.status, 200);
  assert.ok(!/public/.test(staffDetail.headers.get('cache-control') || ''), 'staff detail not public-cacheable');
});

test('posts, collections, workshops and settings reads are cacheable', async () => {
  for (const path of ['/api/posts', '/api/collections', '/api/workshops', '/api/settings']) {
    const res = await api(srv.base, path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('cache-control') || '', /public/, path);
  }
});

test('cart reads are no-store', async () => {
  const res = await api(srv.base, '/api/cart');
  assert.match(res.headers.get('cache-control') || '', /no-store/);
});
