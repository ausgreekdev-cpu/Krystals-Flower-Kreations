import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';

// End-to-end behaviour of the settings features: checkout terms/notes,
// reset + test-email endpoints, maintenance mode, loyalty bonuses and floors,
// workshop open/closed + waitlist switches.
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
      cartId, email: `beh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.com`,
      shippingName: 'Behaviour Tester', shippingAddress: '1 Test St', shippingSuburb: 'Perth',
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
    body: JSON.stringify({
      keys: [
        'terms_required', 'terms_url', 'enable_order_notes', 'announcement_text',
        'loyalty_signup_bonus', 'loyalty_min_redeem_points', 'maintenance_mode', 'maintenance_message',
        'workshop_waitlist_enabled', 'workshop_bookings_enabled',
        'admin_order_alert_enabled', 'admin_order_alert_recipient', 'customer_status_emails_enabled',
      ],
    }),
  }).catch(() => {});
  await srv.close();
});

test('terms can be required and order notes can be disabled', async () => {
  await putSettings({ terms_required: '1', terms_url: 'https://example.com/terms', enable_order_notes: '0' });

  const noTerms = await checkout();
  assert.equal(noTerms.status, 422, JSON.stringify(noTerms.body));
  assert.equal(noTerms.body.code, 'terms_required');
  assert.equal(noTerms.body.details.termsUrl, 'https://example.com/terms');

  const agreed = await checkout({ acceptTerms: true, customerNote: 'Please leave at the door' });
  assert.equal(agreed.status, 200, JSON.stringify(agreed.body));
  assert.equal(agreed.body.order.customerNote, null, 'note dropped while the field is switched off');

  await putSettings({ terms_required: '0', enable_order_notes: '1' });
  const open = await checkout({ customerNote: 'Please leave at the door' });
  assert.equal(open.status, 200, JSON.stringify(open.body));
  assert.equal(open.body.order.customerNote, 'Please leave at the door', 'note stored once re-enabled');
});

test('POST /api/settings/reset returns keys to schema defaults', async () => {
  await putSettings({ announcement_text: 'Changed by test' });
  const all1 = await api(srv.base, '/api/settings/all', { headers: auth() });
  assert.equal(all1.body.announcement_text, 'Changed by test');

  const res = await api(srv.base, '/api/settings/reset', {
    method: 'POST', headers: auth(), body: JSON.stringify({ keys: ['announcement_text'] }),
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.removed, 1);
  assert.equal(res.body.values.announcement_text, "Perth WA studio • Made-to-order 3-7 days • Free Perth delivery over $150");

  const all2 = await api(srv.base, '/api/settings/all', { headers: auth() });
  assert.equal(all2.body.announcement_text, "Perth WA studio • Made-to-order 3-7 days • Free Perth delivery over $150", 'stored override is gone');

  const unknown = await api(srv.base, '/api/settings/reset', {
    method: 'POST', headers: auth(), body: JSON.stringify({ keys: ['not_a_setting'] }),
  });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.code, 'invalid_settings');
});

test('POST /api/settings/test-email reports SMTP status', async () => {
  const anon = await api(srv.base, '/api/settings/test-email', { method: 'POST', body: JSON.stringify({ to: 'a@b.co' }) });
  assert.equal(anon.status, 401, 'admin only');

  const bad = await api(srv.base, '/api/settings/test-email', { method: 'POST', headers: auth(), body: JSON.stringify({ to: 'nope' }) });
  assert.equal(bad.status, 400);

  const res = await api(srv.base, '/api/settings/test-email', { method: 'POST', headers: auth(), body: JSON.stringify({ to: 'krystal@test.local' }) });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(typeof res.body.smtpConfigured, 'boolean');
  assert.match(res.body.message, /SMTP|sent|failed/i);
  if (!process.env.SMTP_HOST) {
    assert.equal(res.body.smtpConfigured, false, 'SMTP unset in tests');
    assert.equal(res.body.skipped, true);
  }
});

test('maintenance mode blocks public reads, keeps settings/auth/health and staff working', async () => {
  await putSettings({ maintenance_mode: '1', maintenance_message: 'Back after a refill' });

  const blocked = await api(srv.base, '/api/products');
  assert.equal(blocked.status, 503, JSON.stringify(blocked.body));
  assert.equal(blocked.body.code, 'maintenance_mode');
  assert.match(blocked.body.error, /refill/);

  const settings = await api(srv.base, '/api/settings');
  assert.equal(settings.status, 200, 'the SPA can still read the flag + message');
  assert.equal(settings.body.maintenance_mode, '1');
  assert.equal(settings.body.maintenance_message, 'Back after a refill');

  const health = await api(srv.base, '/api/health');
  assert.equal(health.status, 200, 'monitors stay green');

  const staff = await api(srv.base, '/api/products', { headers: auth() });
  assert.equal(staff.status, 200, 'admin sessions bypass the gate');

  const mutation = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity: 1 }) });
  assert.equal(mutation.status, 200, 'writes are not intercepted');

  await putSettings({ maintenance_mode: '0' });
  const back = await api(srv.base, '/api/products');
  assert.equal(back.status, 200, 'flipping the switch restores the shop');
});

test('loyalty_signup_bonus is awarded on registration', async () => {
  await putSettings({ loyalty_signup_bonus: '25' });
  const email = `bonus_${Date.now()}@test.com`;
  const reg = await api(srv.base, '/api/auth/register', {
    method: 'POST', body: JSON.stringify({ name: 'Bonus Tester', email, password: 'secret123' }),
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  assert.equal(reg.body.signupBonus, 25);

  const me = await api(srv.base, '/api/loyalty/me', { headers: { Authorization: `Bearer ${reg.body.token}` } });
  assert.equal(me.status, 200);
  assert.equal(me.body.points, 25, 'welcome points landed on the account');

  await putSettings({ loyalty_signup_bonus: '0' });
  const plain = await api(srv.base, '/api/auth/register', {
    method: 'POST', body: JSON.stringify({ name: 'No Bonus', email: `nobonus_${Date.now()}@test.com`, password: 'secret123' }),
  });
  assert.equal(plain.status, 201);
  assert.equal(plain.body.signupBonus, undefined, 'no bonus while set to 0');
});

test('loyalty_min_redeem_points is enforced', async () => {
  await putSettings({ loyalty_min_redeem_points: '300' });
  const email = `redeem_${Date.now()}@test.com`;
  const reg = await api(srv.base, '/api/auth/register', {
    method: 'POST', body: JSON.stringify({ name: 'Redeem Tester', email, password: 'secret123' }),
  });
  assert.equal(reg.status, 201);
  const token = reg.body.token;
  await api(srv.base, '/api/loyalty/set', {
    method: 'POST', headers: auth(), body: JSON.stringify({ email, set: 500, reason: 'test funding' }),
  });

  const tooLow = await api(srv.base, '/api/loyalty/redeem', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ points: 100 }),
  });
  assert.equal(tooLow.status, 422, JSON.stringify(tooLow.body));
  assert.equal(tooLow.body.code, 'below_minimum_redeem');
  assert.equal(tooLow.body.details.minimum, 300);

  const ok = await api(srv.base, '/api/loyalty/redeem', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ points: 300 }),
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.points, 200);

  await putSettings({ loyalty_min_redeem_points: '100' });
});

test('workshop bookings can be closed and waitlisting switched off', async () => {
  const slug = `enforce-ws-${Date.now()}`;
  const ws = await api(srv.base, '/api/workshops', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ title: 'Settings Enforced Workshop', slug, price: 50, capacity: 1 }),
  });
  assert.equal(ws.status, 201, JSON.stringify(ws.body));
  const startsAt = new Date(Date.now() + 7 * 86400e3).toISOString();
  const session = await api(srv.base, `/api/workshops/${ws.body.id}/sessions`, {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ startsAt, endsAt: new Date(Date.now() + 7 * 86400e3 + 7200e3).toISOString(), capacity: 1 }),
  });
  assert.equal(session.status, 201, JSON.stringify(session.body));
  const book = (i) => api(srv.base, `/api/workshops/sessions/${session.body.id}/book`, {
    method: 'POST', body: JSON.stringify({ name: `Bench ${i}`, email: `bench${i}_${Date.now()}@test.com`, quantity: 1 }),
  });

  const first = await book(1);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.status, 'confirmed');

  const second = await book(2);
  assert.equal(second.status, 201, JSON.stringify(second.body));
  assert.equal(second.body.status, 'waitlisted', 'waitlist is the default for a full session');

  await putSettings({ workshop_waitlist_enabled: '0' });
  const third = await book(3);
  assert.equal(third.status, 409, JSON.stringify(third.body));
  assert.equal(third.body.code, 'session_full');

  await putSettings({ workshop_bookings_enabled: '0' });
  const closed = await book(4);
  assert.equal(closed.status, 409, JSON.stringify(closed.body));
  assert.equal(closed.body.code, 'bookings_closed');

  await putSettings({ workshop_waitlist_enabled: '1', workshop_bookings_enabled: '1' });
});

test('new orders alert the studio and status changes email the customer', async () => {
  await putSettings({ admin_order_alert_enabled: '1', admin_order_alert_recipient: 'studio_alert@test.local', customer_status_emails_enabled: '1' });

  const res = await checkout();
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const order = res.body.order;

  const confirm = await prisma.emailQueue.findFirst({ where: { template: 'order_confirmation', payload: { path: ['orderNumber'], equals: order.orderNumber } } });
  assert.ok(confirm, 'confirmation queued');

  const alert = await prisma.emailQueue.findFirst({ where: { template: 'admin_order_alert', to: 'studio_alert@test.local', payload: { path: ['orderNumber'], equals: order.orderNumber } } });
  assert.ok(alert, 'studio alert queued to the configured recipient');

  const status = await api(srv.base, `/api/orders/${order.id}/status`, {
    method: 'PATCH', headers: auth(), body: JSON.stringify({ status: 'paid' }),
  });
  assert.equal(status.status, 200, JSON.stringify(status.body));

  const update = await prisma.emailQueue.findFirst({ where: { template: 'order_status_update', payload: { path: ['orderNumber'], equals: order.orderNumber } } });
  assert.ok(update, 'status update queued for the customer');

  await putSettings({ admin_order_alert_enabled: '0', customer_status_emails_enabled: '0' });
  const res2 = await checkout();
  assert.equal(res2.status, 200);
  const quiet = await prisma.emailQueue.findFirst({ where: { template: 'admin_order_alert', payload: { path: ['orderNumber'], equals: res2.body.order.orderNumber } } });
  assert.equal(quiet, null, 'no studio alert while the toggle is off');
  await putSettings({ admin_order_alert_enabled: '1', customer_status_emails_enabled: '1' });
});
