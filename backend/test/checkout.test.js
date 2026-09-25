import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';

let srv;
let productId;
let cartId;

before(async () => {
  srv = await startServer();
  const { body } = await api(srv.base, '/api/products');
  productId = body.products.find((p) => p.slug === 'eucalyptus-paper-rose-bouquet-blush').id;
});
after(async () => { await srv.close(); });

test('POST /api/cart/add creates a cart and line', async () => {
  const { status, body } = await api(srv.base, '/api/cart/add', {
    method: 'POST',
    body: JSON.stringify({ productId, quantity: 2 }),
  });
  assert.equal(status, 200);
  cartId = body.cartId || body.cart?.id;
  assert.ok(cartId);
  const items = body.cart?.items || [];
  assert.ok(items.length >= 1);
  const item = items.find((l) => l.productId === productId);
  assert.equal(item.quantity, 2);
});

test('GET /api/cart/ with X-Cart-Id returns the cart', async () => {
  const { status, body } = await api(srv.base, '/api/cart/', {
    headers: { 'X-Cart-Id': cartId },
  });
  assert.equal(status, 200);
  assert.equal(body.id, cartId);
  assert.ok(body.items?.length >= 1);
});

test('checkout creates a pending bank-transfer order with shipping + GST', async () => {
  const { status, body } = await api(srv.base, '/api/orders/checkout', {
    method: 'POST',
    body: JSON.stringify({
      cartId,
      email: 'buyer@test.com',
      shippingName: 'Test Buyer',
      shippingAddress: '1 Test St',
      shippingSuburb: 'Perth',
      shippingState: 'WA',
      shippingPostcode: '6000',
      paymentMethod: 'bank_transfer',
    }),
  });
  assert.equal(status, 200, JSON.stringify(body).slice(0, 300));
  assert.ok(body.order?.orderNumber, 'has order number');
  assert.equal(body.order.paymentMethod, 'bank_transfer');
  assert.equal(body.order.status, 'pending_payment');
  assert.ok(Number(body.order.total) > 0);
  assert.ok(body.gst !== undefined);
  assert.ok(body.shipping !== undefined, 'shipping returned');
});

test('checkout rejects a missing cart', async () => {
  const { status, body } = await api(srv.base, '/api/orders/checkout', {
    method: 'POST',
    body: JSON.stringify({
      cartId: 'does-not-exist',
      email: 'buyer@test.com',
      shippingName: 'X', shippingAddress: 'X', shippingSuburb: 'Perth',
      shippingState: 'WA', shippingPostcode: '6000', paymentMethod: 'bank_transfer',
    }),
  });
  assert.equal(status, 400);
  assert.ok(body.error);
});