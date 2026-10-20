import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/lib/prisma.js';
import { startServer, api } from './helpers.js';

// Customer account area: self-service password reset (hashed, single-use,
// expiring tokens) and the account endpoints (own order history + re-issued
// digital download links).
const STAMP = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const CUSTOMER = { email: `acct-${STAMP}@test.com`, password: 'original-pass-1', name: 'Account Tester' };
const OTHER = { email: `acct-other-${STAMP}@test.com` };

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';

let srv;
let adminToken;
let productId;
let customerToken;
let orderId;
let orderNumber;
let otherOrderNumber;
// Raw value of the token that the happy-path reset spent — reused below to
// prove single-use. The server only keeps its hash, so this is the only copy.
let consumedToken;

const json = (body, token) => ({
  method: 'POST',
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  body: JSON.stringify(body),
});

async function checkoutAs(email) {
  const add = await api(srv.base, '/api/cart/add', json({ productId, quantity: 1 }));
  assert.equal(add.status, 200, JSON.stringify(add.body).slice(0, 300));
  const cartId = add.body.cartId || add.body.cart?.id;
  const res = await api(srv.base, '/api/orders/checkout', json({
    cartId,
    email,
    shippingName: 'Account Tester',
    shippingAddress: '1 Test St',
    shippingSuburb: 'Perth',
    shippingState: 'WA',
    shippingPostcode: '6000',
    paymentMethod: 'bank_transfer',
  }));
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 400));
  return res.body.order;
}

// Pull the single-use token out of the queued reset email, exactly as a
// customer would out of their inbox.
async function latestResetToken(email) {
  const row = await prisma.emailQueue.findFirst({
    where: { to: email, template: 'password_reset' },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(row, 'a password_reset email should be queued');
  const m = String(row.text || '').match(/\/reset-password\?token=([A-Za-z0-9_-]+)/);
  assert.ok(m, `reset link with a token, got: ${row.text}`);
  return m[1];
}

before(async () => {
  srv = await startServer();

  const login = await api(srv.base, '/api/auth/login', json({ email: 'admin@krystal.local', password: 'admin123' }));
  assert.equal(login.status, 200);
  adminToken = login.body.token;

  const created = await api(srv.base, '/api/products', json({
    title: 'Account Digital Template',
    slug: `acct-dl-${STAMP}`,
    description: 'x',
    type: 'digital_template',
    stockMode: 'digital',
    price: 14.95,
  }, adminToken));
  assert.equal(created.status, 201, JSON.stringify(created.body).slice(0, 300));
  productId = created.body.id;
  // One photo so the order-history contract (line carries a thumb) is testable.
  await prisma.productImage.create({
    data: { productId, url: '/placeholder-bloom.svg', alt: 'Account Digital Template', sortOrder: 0 },
  });

  // The file itself, so a re-issued link can be proven to stream bytes.
  const fd = new FormData();
  fd.append('file', new Blob([SVG], { type: 'image/svg+xml' }), 'template.svg');
  const up = await fetch(`${srv.base}/api/products/${productId}/svg`, {
    method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: fd,
  });
  assert.equal(up.status, 201);

  const reg = await api(srv.base, '/api/auth/register', json(CUSTOMER));
  assert.equal(reg.status, 201, JSON.stringify(reg.body).slice(0, 300));
  customerToken = reg.body.token;

  const order = await checkoutAs(CUSTOMER.email);
  orderId = order.id;
  orderNumber = order.orderNumber;

  const other = await checkoutAs(OTHER.email);
  otherOrderNumber = other.orderNumber;
});

after(async () => {
  const emails = [CUSTOMER.email, OTHER.email];
  await prisma.order.deleteMany({ where: { email: { in: emails } } }).catch(() => {});
  await prisma.passwordResetToken.deleteMany({ where: { user: { email: { in: emails } } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { in: emails } } }).catch(() => {});
  await prisma.emailQueue.deleteMany({ where: { to: { in: emails } } }).catch(() => {});
  if (productId) await api(srv.base, `/api/products/${productId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } }).catch(() => {});
  await srv.close();
});

// ── Password reset ─────────────────────────────────────────────────────────

test('forgot-password answers identically for unknown and known emails', async () => {
  const unknown = await api(srv.base, '/api/auth/forgot-password', json({ email: `nobody-${STAMP}@test.com` }));
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.ok, true);
  const queued = await prisma.emailQueue.count({ where: { to: `nobody-${STAMP}@test.com` } });
  assert.equal(queued, 0, 'nothing queued for an address with no account');

  const known = await api(srv.base, '/api/auth/forgot-password', json({ email: CUSTOMER.email }));
  assert.equal(known.status, 200);
  assert.equal(known.body.ok, true);
  assert.deepEqual(
    { ok: known.body.ok, message: known.body.message },
    { ok: unknown.body.ok, message: unknown.body.message },
    'same body either way — no account-enumeration oracle',
  );
});

test('reset email carries a single-use link, stored only as a hash', async () => {
  const token = await latestResetToken(CUSTOMER.email);
  const rows = await prisma.passwordResetToken.findMany({ where: { user: { email: CUSTOMER.email } } });
  assert.ok(rows.length >= 1);
  assert.ok(!rows.some((r) => r.tokenHash === token), 'raw token is never stored');
  assert.ok(rows.every((r) => /^[a-f0-9]{64}$/.test(r.tokenHash)), 'sha256 hex stored');
});

test('unknown reset token is rejected without revealing anything', async () => {
  const res = await api(srv.base, '/api/auth/reset-password', json({ token: 'x'.repeat(43), password: 'brand-new-pass-1' }));
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'invalid_reset_token');
});

test('reset password must be at least 8 characters', async () => {
  const token = await latestResetToken(CUSTOMER.email);
  const res = await api(srv.base, '/api/auth/reset-password', json({ token, password: 'short' }));
  assert.equal(res.status, 400);
});

test('a valid token changes the password and signs the customer in', async () => {
  const token = await latestResetToken(CUSTOMER.email);
  consumedToken = token;
  const res = await api(srv.base, '/api/auth/reset-password', json({ token, password: 'reset-pass-2222' }));
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  assert.ok(res.body.token, 'returns a fresh session token');
  assert.equal(res.body.user.email, CUSTOMER.email);

  const oldWay = await api(srv.base, '/api/auth/login', json({ email: CUSTOMER.email, password: CUSTOMER.password }));
  assert.equal(oldWay.status, 401, 'old password no longer works');

  const newWay = await api(srv.base, '/api/auth/login', json({ email: CUSTOMER.email, password: 'reset-pass-2222' }));
  assert.equal(newWay.status, 200, 'new password works');
  customerToken = newWay.body.token;
});

test('the same link cannot be used twice', async () => {
  assert.ok(consumedToken, 'the consumed token was captured');
  const rows = await prisma.passwordResetToken.findMany({
    where: { user: { email: CUSTOMER.email }, usedAt: { not: null } },
    orderBy: { usedAt: 'desc' },
  });
  assert.ok(rows.length >= 1, 'the spent token is retained (marked used) for audit');

  const again = await api(srv.base, '/api/auth/reset-password', json({ token: consumedToken, password: 'another-pass-333' }));
  assert.equal(again.status, 400, 'replaying the spent token is refused');
  assert.equal(again.body.code, 'invalid_reset_token');

  const stillWorks = await api(srv.base, '/api/auth/login', json({ email: CUSTOMER.email, password: 'reset-pass-2222' }));
  assert.equal(stillWorks.status, 200, 'the replay attempt did not change the password');
});

test('an expired token is refused', async () => {
  await api(srv.base, '/api/auth/forgot-password', json({ email: CUSTOMER.email }));
  const token = await latestResetToken(CUSTOMER.email);
  await prisma.passwordResetToken.updateMany({
    where: { user: { email: CUSTOMER.email }, usedAt: null },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });
  const res = await api(srv.base, '/api/auth/reset-password', json({ token, password: 'expired-pass-444' }));
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'invalid_reset_token');

  const stillOld = await api(srv.base, '/api/auth/login', json({ email: CUSTOMER.email, password: 'reset-pass-2222' }));
  assert.equal(stillOld.status, 200, 'password untouched after a refused reset');
});

test('requesting a new link invalidates the previous one', async () => {
  await api(srv.base, '/api/auth/forgot-password', json({ email: CUSTOMER.email }));
  const first = await latestResetToken(CUSTOMER.email);
  await api(srv.base, '/api/auth/forgot-password', json({ email: CUSTOMER.email }));
  const second = await latestResetToken(CUSTOMER.email);
  assert.notEqual(first, second, 'each request mints a new token');

  const dead = await api(srv.base, '/api/auth/reset-password', json({ token: first, password: 'first-link-pass-5' }));
  assert.equal(dead.status, 400, 'older link is dead');

  const live = await api(srv.base, '/api/auth/reset-password', json({ token: second, password: 'second-link-pass-6' }));
  assert.equal(live.status, 200);
  customerToken = live.body.token;
});

// ── Account area ───────────────────────────────────────────────────────────

test('account endpoints require a session', async () => {
  assert.equal((await api(srv.base, '/api/account/orders')).status, 401);
  assert.equal((await api(srv.base, '/api/account/downloads')).status, 401);
});

test('order history is scoped to the account and includes guest orders by email', async () => {
  const res = await api(srv.base, '/api/account/orders', { headers: { Authorization: `Bearer ${customerToken}` } });
  assert.equal(res.status, 200);
  const numbers = res.body.orders.map((o) => o.orderNumber);
  assert.ok(numbers.includes(orderNumber), 'order placed with this email is listed (never signed in at checkout)');
  assert.ok(!numbers.includes(otherOrderNumber), "another customer's order is not");

  const mine = res.body.orders.find((o) => o.orderNumber === orderNumber);
  assert.equal(mine.lines.length, 1);
  assert.equal(mine.lines[0].isDigital, true);
  assert.equal(mine.itemCount, 1);
  assert.equal(mine.lines[0].image.url, '/placeholder-bloom.svg', 'line carries the product photo for the UI');
  assert.ok(mine.lines[0].image.alt, 'image carries alt text');
  assert.ok(!('adminNote' in mine), 'internal fields are not exposed');
  assert.ok(!('paypalOrderId' in mine));
  assert.equal(mine.hasDownloads, false, 'unpaid orders do not advertise downloads');
});

test('unpaid digital orders do not expose download links', async () => {
  const res = await api(srv.base, '/api/account/downloads', { headers: { Authorization: `Bearer ${customerToken}` } });
  assert.equal(res.status, 200);
  assert.equal(res.body.downloads.length, 0, 'payment required');
});

test('paying unlocks a working download link, re-minted on every view', async () => {
  const paid = await api(srv.base, `/api/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'paid', note: 'test: bank transfer cleared' }),
  });
  assert.equal(paid.status, 200, JSON.stringify(paid.body).slice(0, 300));

  // Simulate both a stale stored link and an expired one: the endpoint must
  // hand back a fresh, different token.
  await prisma.orderLine.updateMany({ where: { orderId }, data: { downloadUrl: '/api/dl/expired-token' } });

  const res = await api(srv.base, '/api/account/downloads', { headers: { Authorization: `Bearer ${customerToken}` } });
  assert.equal(res.status, 200);
  assert.equal(res.body.downloads.length, 1);
  const dl = res.body.downloads[0];
  assert.match(dl.url, /^\/api\/dl\/[A-Za-z0-9._-]+$/);
  assert.notEqual(dl.url, '/api/dl/expired-token', 're-issued, not echoed back');
  assert.equal(dl.orderNumber, orderNumber);
  assert.equal(dl.title, 'Account Digital Template');

  const persisted = await prisma.orderLine.findFirst({ where: { orderId, isDigital: true } });
  assert.equal(persisted.downloadUrl, dl.url, 'stored link refreshed so emailed links keep working too');

  // And the re-issued link actually streams the file.
  const file = await fetch(`${srv.base}${dl.url}`);
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-type') || '', /svg/);
  const bytes = await file.text();
  assert.match(bytes, /<svg/);

  const orders = await api(srv.base, '/api/account/orders', { headers: { Authorization: `Bearer ${customerToken}` } });
  const mine = orders.body.orders.find((o) => o.orderNumber === orderNumber);
  assert.equal(mine.hasDownloads, true, 'paid order advertises its downloads');
});

test('another customer cannot reach this account\'s files', async () => {
  const reg = await api(srv.base, '/api/auth/register', json({ name: 'Other Buyer', email: OTHER.email, password: 'other-pass-123' }));
  assert.equal(reg.status, 201);
  const res = await api(srv.base, '/api/account/downloads', { headers: { Authorization: `Bearer ${reg.body.token}` } });
  assert.equal(res.status, 200);
  assert.equal(res.body.downloads.length, 0, 'their own unpaid order stays locked');
});

test('refunded orders lose download access', async () => {
  const refunded = await api(srv.base, `/api/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'refunded', note: 'test refund' }),
  });
  assert.equal(refunded.status, 200, JSON.stringify(refunded.body).slice(0, 300));

  const res = await api(srv.base, '/api/account/downloads', { headers: { Authorization: `Bearer ${customerToken}` } });
  assert.equal(res.status, 200);
  assert.equal(res.body.downloads.length, 0);
});
