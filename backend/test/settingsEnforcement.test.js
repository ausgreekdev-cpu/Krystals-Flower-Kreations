import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';

// Admin-configured checkout rules: enabled payment methods, minimum order
// total, and the global free-shipping threshold.
let srv;
let adminToken;
let productId;

const auth = () => ({ Authorization: `Bearer ${adminToken}` });

async function putSettings(body) {
  const res = await api(srv.base, '/api/settings', { method: 'PUT', headers: auth(), body: JSON.stringify(body) });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

async function newCart() {
  const res = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity: 1 }) });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.cartId || res.body.cart?.id;
}

async function checkout(extra = {}) {
  const cartId = await newCart();
  return api(srv.base, '/api/orders/checkout', {
    method: 'POST',
    body: JSON.stringify({
      cartId, email: `enf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`,
      shippingName: 'Enforcement Tester', shippingAddress: '1 Test St', shippingSuburb: 'Perth',
      shippingState: 'WA', shippingPostcode: '6000', paymentMethod: 'bank_transfer', ...extra,
    }),
  });
}

before(async () => {
  srv = await startServer();
  const admin = await api(srv.base, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }) });
  adminToken = admin.body.token;
  const { body } = await api(srv.base, '/api/products');
  productId = body.products.find((p) => p.slug === 'eucalyptus-paper-rose-bouquet-blush').id;
});
after(async () => {
  // Settings are global DB state — always hand the DB back at schema defaults,
  // even when a test in this file fails halfway through.
  await api(srv.base, '/api/settings/reset', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ keys: ['checkout_payment_methods', 'min_order_amount', 'shipping_free_over'] }),
  }).catch(() => {});
  await srv.close();
});

test('checkout rejects payment methods the store has disabled', async () => {
  await putSettings({ checkout_payment_methods: 'bank_transfer' });

  const rejected = await checkout({ paymentMethod: 'cash' });
  assert.equal(rejected.status, 422, JSON.stringify(rejected.body));
  assert.equal(rejected.body.code, 'payment_method_disabled');
  assert.deepEqual(rejected.body.details.enabled, ['bank_transfer']);

  const allowed = await checkout({ paymentMethod: 'bank_transfer' });
  assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
  assert.equal(allowed.body.order.paymentMethod, 'bank_transfer');

  await putSettings({ checkout_payment_methods: 'bank_transfer,pickup,cash' });
});

test('checkout enforces min_order_amount', async () => {
  await putSettings({ min_order_amount: '500' });
  const tooSmall = await checkout();
  assert.equal(tooSmall.status, 422, JSON.stringify(tooSmall.body));
  assert.equal(tooSmall.body.code, 'below_minimum_order');
  assert.equal(tooSmall.body.details.minimum, 500);

  await putSettings({ min_order_amount: '0' });
  const ok = await checkout();
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(Number(ok.body.order.subtotal) < 500, 'a normal order passes once the minimum is lifted');
});

test('shipping_free_over makes checkout shipping free past the threshold', async () => {
  await putSettings({ shipping_free_over: '1' });
  const res = await checkout();
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(Number(res.body.order.shippingCost), 0, 'free shipping applies at the configured threshold');
  assert.equal(Number(res.body.shipping.price), 0);
  await putSettings({ shipping_free_over: '150' });
});
