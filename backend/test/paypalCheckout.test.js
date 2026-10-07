import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';

let srv;
let adminToken;
let productId;
let paidOrderId;
let paidOrderNumber;
// Idempotency keys are unique per run — fixed keys would collide with orders
// left behind by previous runs (findUnique on idempotencyKey returns those).
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function newCart() {
  const { body } = await api(srv.base, '/api/cart/add', {
    method: 'POST',
    body: JSON.stringify({ productId, quantity: 1 }),
  });
  return body.cartId || body.cart?.id;
}

async function checkoutBody(extra = {}) {
  return {
    cartId: await newCart(),
    email: `pp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`,
    shippingName: 'PayPal Tester',
    shippingAddress: '1 Test St',
    shippingSuburb: 'Perth',
    shippingState: 'WA',
    shippingPostcode: '6000',
    paymentMethod: 'paypal',
    ...extra,
  };
}

async function create(body, idempotencyKey) {
  return api(srv.base, '/api/orders/paypal/create', {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    body: JSON.stringify(body),
  });
}

function auth(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

before(async () => {
  srv = await startServer();
  const login = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  adminToken = login.body.token;
  const { body } = await api(srv.base, '/api/products');
  productId = body.products.find((p) => p.slug === 'eucalyptus-paper-rose-bouquet-blush').id;
  await api(srv.base, '/api/settings', {
    method: 'PUT',
    headers: auth(adminToken),
    body: JSON.stringify({ checkout_payment_methods: 'paypal,bank_transfer,pickup' }),
  });
});

after(async () => {
  // Settings are global DB state — hand them back to schema defaults.
  await api(srv.base, '/api/settings/reset', {
    method: 'POST',
    headers: auth(adminToken),
    body: JSON.stringify({ keys: ['checkout_payment_methods', 'paypal_client_id'] }),
  }).catch(() => {});
  await srv.close();
});

test('paypal create is refused with 503 while PayPal is off', async () => {
  process.env.PAYPAL_MODE = 'off';
  try {
    const { status, body } = await create(await checkoutBody(), `pp-off-1-${runId}`);
    assert.equal(status, 503, JSON.stringify(body));
    assert.equal(body.code, 'paypal_disabled');
    assert.match(body.error, /not enabled/i);
  } finally {
    delete process.env.PAYPAL_MODE;
  }
});

test('prepare keeps the cart, capture marks paid idempotently (mock mode)', async () => {
  const key = `pp-flow-1-${runId}`;
  const body = await checkoutBody();
  const first = await create(body, key);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.order.status, 'pending_payment');
  assert.equal(first.body.order.paymentStatus, 'pending');
  assert.equal(first.body.order.paymentMethod, 'paypal');
  assert.equal(first.body.paypalOrderId, `MOCK-PP-${first.body.order.orderNumber}`);

  // Same Idempotency-Key → same order + same PayPal session, cart untouched
  // (cart clear is deferred until capture succeeds).
  const second = await create(await checkoutBody(), key);
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.order.orderNumber, first.body.order.orderNumber);
  assert.equal(second.body.paypalOrderId, first.body.paypalOrderId);
  const cart = await api(srv.base, '/api/cart/', { headers: { 'X-Cart-Id': body.cartId } });
  assert.ok((cart.body.items || []).length >= 1, 'cart still has items after prepare');

  // Capture is refused while PayPal is off (same config gate as create).
  process.env.PAYPAL_MODE = 'off';
  let blocked;
  try {
    blocked = await api(srv.base, '/api/orders/paypal/capture', {
      method: 'POST',
      body: JSON.stringify({ paypalOrderId: first.body.paypalOrderId }),
    });
  } finally {
    delete process.env.PAYPAL_MODE;
  }
  assert.equal(blocked.status, 503, JSON.stringify(blocked.body));
  assert.equal(blocked.body.code, 'paypal_disabled');

  // Capture succeeds (mock): paid flip + Payment row + history note.
  const cap = await api(srv.base, '/api/orders/paypal/capture', {
    method: 'POST',
    body: JSON.stringify({ paypalOrderId: first.body.paypalOrderId }),
  });
  assert.equal(cap.status, 200, JSON.stringify(cap.body));
  assert.equal(cap.body.captured, true);
  assert.equal(cap.body.order.status, 'paid');
  assert.equal(cap.body.order.paymentStatus, 'paid');
  paidOrderId = cap.body.order.id;
  paidOrderNumber = cap.body.order.orderNumber;

  const payment = await prisma.payment.findFirst({ where: { orderId: paidOrderId, method: 'paypal' } });
  assert.ok(payment, 'payment row written');
  assert.equal(payment.status, 'paid');
  assert.equal(payment.reference, `MOCK-CAP-${first.body.paypalOrderId}`);

  const history = await prisma.orderStatusHistory.findFirst({
    where: { orderId: paidOrderId, fromStatus: 'pending_payment', toStatus: 'paid' },
  });
  assert.ok(history, 'status history row');
  assert.match(history.note, /^PayPal capture /);

  // Repeat capture → idempotent success, no second payment row.
  const again = await api(srv.base, '/api/orders/paypal/capture', {
    method: 'POST',
    body: JSON.stringify({ paypalOrderId: first.body.paypalOrderId }),
  });
  assert.equal(again.status, 200);
  assert.equal(again.body.idempotent, true);
  const payments = await prisma.payment.count({ where: { orderId: paidOrderId, method: 'paypal' } });
  assert.equal(payments, 1);

  // Repeat create with the same key after capture → paid:true (frontend shows success).
  const reCreate = await create(await checkoutBody(), key);
  assert.equal(reCreate.status, 200);
  assert.equal(reCreate.body.paid, true);
  assert.equal(reCreate.body.order.orderNumber, paidOrderNumber);
});

test('capture with an unknown paypalOrderId returns 404', async () => {
  const { status, body } = await api(srv.base, '/api/orders/paypal/capture', {
    method: 'POST',
    body: JSON.stringify({ paypalOrderId: 'MOCK-PP-nope-does-not-exist' }),
  });
  assert.equal(status, 404);
  assert.equal(body.code, 'not_found');
});

test('prepare is rejected when paypal is not an enabled method', async () => {
  await api(srv.base, '/api/settings', {
    method: 'PUT',
    headers: auth(adminToken),
    body: JSON.stringify({ checkout_payment_methods: 'bank_transfer' }),
  });
  try {
    const { status, body } = await create(await checkoutBody(), `pp-disabled-method-${runId}`);
    assert.equal(status, 422, JSON.stringify(body));
    assert.equal(body.code, 'payment_method_disabled');
    assert.deepEqual(body.details.enabled, ['bank_transfer']);
  } finally {
    await api(srv.base, '/api/settings', {
      method: 'PUT',
      headers: auth(adminToken),
      body: JSON.stringify({ checkout_payment_methods: 'paypal,bank_transfer,pickup' }),
    });
  }
});

test('refund requires admin, applies once, and mirrors the refund behaviour', async () => {
  assert.ok(paidOrderId, 'flow test must run first');

  // Guest → 401.
  const guest = await api(srv.base, `/api/orders/${paidOrderId}/refund`, { method: 'POST', body: JSON.stringify({}) });
  assert.equal(guest.status, 401);

  // Logged-in customer → 403.
  const email = `pp_cust_${Date.now()}@test.com`;
  const reg = await api(srv.base, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'PayPal Customer', email, password: 'customer123' }),
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const customerAuthToken = reg.body.token;
  const customer = await api(srv.base, `/api/orders/${paidOrderId}/refund`, {
    method: 'POST',
    headers: auth(customerAuthToken),
    body: JSON.stringify({}),
  });
  assert.equal(customer.status, 403);

  // Admin → refunded (status, payment row, history, audit note).
  const ok = await api(srv.base, `/api/orders/${paidOrderId}/refund`, {
    method: 'POST',
    headers: auth(adminToken),
    body: JSON.stringify({}),
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.status, 'refunded');
  assert.equal(ok.body.paymentStatus, 'refunded');
  const payment = await prisma.payment.findFirst({ where: { orderId: paidOrderId, method: 'paypal' } });
  assert.equal(payment.status, 'refunded');
  const history = await prisma.orderStatusHistory.findFirst({
    where: { orderId: paidOrderId, toStatus: 'refunded' },
  });
  assert.match(history.note, /^PayPal refund /);

  // Second refund → 409.
  const twice = await api(srv.base, `/api/orders/${paidOrderId}/refund`, {
    method: 'POST',
    headers: auth(adminToken),
    body: JSON.stringify({}),
  });
  assert.equal(twice.status, 409);
  assert.equal(twice.body.code, 'already_refunded');
});

test('refund of a non-payPal order returns 409', async () => {
  const { body } = await api(srv.base, '/api/orders/checkout', {
    method: 'POST',
    body: JSON.stringify(await checkoutBody({ paymentMethod: 'bank_transfer' })),
  });
  assert.equal(body?.order?.paymentStatus, 'pending', JSON.stringify(body).slice(0, 200));
  const { status, body: res } = await api(srv.base, `/api/orders/${body.order.id}/refund`, {
    method: 'POST',
    headers: auth(adminToken),
    body: JSON.stringify({}),
  });
  assert.equal(status, 409);
  assert.equal(res.code, 'not_paypal_order');
});
