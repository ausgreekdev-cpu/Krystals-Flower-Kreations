import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';

// Regression tests for client-controlled money/points/payment-state bugs.
let srv;
let customerToken;
const customerEmail = `sec_${Date.now()}@test.com`;

before(async () => {
  srv = await startServer();
  const { status, body } = await api(srv.base, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Sec Tester', email: customerEmail, password: 'secret123' }),
  });
  assert.equal(status, 201, JSON.stringify(body));
  customerToken = body.token;
});
after(async () => { await srv.close(); });

test('login is case-insensitive on email', async () => {
  const { status, body } = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ADMIN@Krystal.Local', password: 'admin123' }),
  });
  assert.equal(status, 200, JSON.stringify(body));
  assert.ok(body.token);
});

test('public checkout with paymentMethod=cash is NOT marked paid', async () => {
  // The store's enabled methods are admin-configured — open cash for this check.
  const admin = await api(srv.base, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }) });
  await api(srv.base, '/api/settings', {
    method: 'PUT', headers: { Authorization: `Bearer ${admin.body.token}` },
    body: JSON.stringify({ checkout_payment_methods: 'bank_transfer,pickup,cash,manual' }),
  });
  const { body: list } = await api(srv.base, '/api/products');
  const productId = list.products.find((p) => p.slug === 'eucalyptus-paper-rose-bouquet-blush').id;
  const { body: cartRes } = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity: 1 }) });
  const cartId = cartRes.cartId || cartRes.cart?.id;
  const { status, body } = await api(srv.base, '/api/orders/checkout', {
    method: 'POST',
    body: JSON.stringify({
      cartId, email: 'Cash.Buyer@Test.com', shippingName: 'Cash Buyer', shippingAddress: '1 Test St',
      shippingSuburb: 'Perth', shippingState: 'WA', shippingPostcode: '6000', paymentMethod: 'cash',
    }),
  });
  assert.equal(status, 200, JSON.stringify(body).slice(0, 300));
  assert.equal(body.order.status, 'pending_payment');
  assert.equal(body.order.paymentStatus, 'pending');
  assert.equal(body.order.email, 'cash.buyer@test.com');
});

test('customers cannot self-award loyalty points', async () => {
  const { status } = await api(srv.base, '/api/loyalty/earn', {
    method: 'POST',
    headers: { Authorization: `Bearer ${customerToken}` },
    body: JSON.stringify({ email: customerEmail, points: 500, reason: 'review' }),
  });
  assert.equal(status, 403);
});

test('booking ignores client-supplied totalPaid and hides PII on public ticket lookup', async () => {
  const { body: workshops } = await api(srv.base, '/api/workshops');
  const ws = workshops.find((w) => w.sessions?.some((s) => new Date(s.startsAt) > new Date() && s.bookedCount < s.capacity));
  assert.ok(ws, 'a workshop with an open future session');
  const session = ws.sessions.find((s) => new Date(s.startsAt) > new Date() && s.bookedCount < s.capacity);
  const { status, body } = await api(srv.base, `/api/workshops/sessions/${session.id}/book`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Sec Tester', email: customerEmail, quantity: 1, totalPaid: 0 }),
  });
  assert.equal(status, 201, JSON.stringify(body));
  if (body.status === 'confirmed') {
    assert.equal(Number(body.totalPaid), Number(ws.price));
    const { status: ts, body: ticket } = await api(srv.base, `/api/workshops/tickets/${encodeURIComponent(body.ticket.qrPayload)}`);
    assert.equal(ts, 200);
    assert.equal(ticket.booking.email, undefined);
    assert.equal(ticket.booking.phone, undefined);
  }
});

test('image upload rejects non-image bytes with 400 (not 500)', async () => {
  const { body: login } = await api(srv.base, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }) });
  const { body: list } = await api(srv.base, '/api/products');
  const fd = new FormData();
  fd.append('images', new Blob([Buffer.from('not really an image')], { type: 'image/png' }), 'fake.png');
  const res = await fetch(`${srv.base}/api/products/${list.products[0].id}/images`, { method: 'POST', headers: { Authorization: `Bearer ${login.token}` }, body: fd });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'invalid_image');
});
