import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/lib/prisma.js';
import { runAbandonedCartReminders } from '../src/services/cartRecovery.js';
import { startServer, api } from './helpers.js';

// Cart recovery: email capture endpoint, abandoned-cart reminder eligibility
// (single send, deduped by reminderSentAt, retention clamp, toggle off), and
// the custom-order confirmation email that previously never sent.
let srv;
let productId;

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function makeCart(email) {
  const add = await api(srv.base, '/api/cart/add', {
    method: 'POST',
    body: JSON.stringify({ productId, quantity: 1 }),
  });
  assert.equal(add.status, 200, JSON.stringify(add.body).slice(0, 200));
  const cartId = add.body.cartId || add.body.cart?.id;
  assert.ok(cartId);
  if (email) {
    const saved = await api(srv.base, '/api/cart/email', {
      method: 'POST',
      body: JSON.stringify({ cartId, email }),
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
  }
  return cartId;
}

async function ageCart(cartId, hoursAgo) {
  await prisma.cart.update({
    where: { id: cartId },
    data: { updatedAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000) },
  });
}

before(async () => {
  srv = await startServer();
  const { body } = await api(srv.base, '/api/products?limit=10');
  const p = body.products.find((x) => x.slug === 'eucalyptus-paper-rose-bouquet-blush') || body.products[0];
  productId = p.id;
});
after(async () => {
  await prisma.cart.deleteMany({ where: { email: { endsWith: '@test.com' } } }).catch(() => {});
  await prisma.customArtOrder.deleteMany({ where: { customerEmail: { endsWith: '@test.com' } } }).catch(() => {});
  await srv.close();
});

test('POST /api/cart/email stores a lowercased email on the cart', async () => {
  const cartId = await makeCart();
  const res = await api(srv.base, '/api/cart/email', {
    method: 'POST',
    body: JSON.stringify({ cartId, email: 'Reminder@Test.com' }),
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const cart = await prisma.cart.findUnique({ where: { id: cartId } });
  assert.equal(cart.email, 'reminder@test.com');
  assert.ok(cart.emailCapturedAt, 'emailCapturedAt stamped');
  assert.equal(cart.reminderSentAt, null, 'no reminder yet');
});

test('POST /api/cart/email rejects invalid email and unknown cart', async () => {
  const cartId = await makeCart();
  const bad = await api(srv.base, '/api/cart/email', {
    method: 'POST',
    body: JSON.stringify({ cartId, email: 'not-an-email' }),
  });
  assert.equal(bad.status, 400);
  const missing = await api(srv.base, '/api/cart/email', {
    method: 'POST',
    body: JSON.stringify({ cartId: 'clidoesnotexist00000', email: 'ok@test.com' }),
  });
  assert.equal(missing.status, 404);
});

test('eligible cart: reminder sends once, stamps reminderSentAt, queue has restore link', async () => {
  const cartId = await makeCart('eligible@test.com');
  await ageCart(cartId, 5); // idle 5h > default 4h threshold

  const first = await runAbandonedCartReminders({});
  assert.equal(first.sent, 1, JSON.stringify(first));
  const cart = await prisma.cart.findUnique({ where: { id: cartId } });
  assert.ok(cart.reminderSentAt, 'reminderSentAt stamped');

  const row = await prisma.emailQueue.findFirst({
    where: { template: 'cart_reminder', to: 'eligible@test.com' },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(row, 'cart_reminder queued');
  assert.ok(row.text.includes(`/cart?restore=${cartId}`), 'restore link present');
  assert.ok(row.text.includes('$'), 'subtotal line present');

  // Second pass: already reminded — no double send.
  const second = await runAbandonedCartReminders({});
  assert.equal(second.sent, 0, 'idempotent on second pass');
});

test('eligibility skips: no email, fresh cart, empty items', async () => {
  const noEmail = await makeCart(); // items, no email
  await ageCart(noEmail, 5);
  const fresh = await makeCart('fresh@test.com'); // email + items, just touched
  const r = await runAbandonedCartReminders({});
  const skippedIds = [];
  if (r.sent !== 0) {
    // Nothing we created should have been picked up
    const rows = await prisma.emailQueue.findMany({
      where: { template: 'cart_reminder', createdAt: { gte: new Date(Date.now() - 60_000) } },
    });
    for (const row of rows) {
      assert.ok(!row.text.includes(noEmail), 'no-email cart never reminded');
      assert.ok(!row.text.includes(fresh), 'fresh cart never reminded');
      skippedIds.push(row.id);
    }
  }
  const noEmailCart = await prisma.cart.findUnique({ where: { id: noEmail } });
  assert.equal(noEmailCart.reminderSentAt, null, 'no-email cart unstamped');
  const freshCart = await prisma.cart.findUnique({ where: { id: fresh } });
  assert.equal(freshCart.reminderSentAt, null, 'fresh cart unstamped');
});

test('toggle off sends nothing; idle hours clamp to retention − 1', async () => {
  const off = await makeCart('disabled@test.com');
  await ageCart(off, 5);
  const r = await runAbandonedCartReminders({ abandoned_cart_emails_enabled: '0' });
  assert.equal(r.sent, 0);
  assert.equal(r.skipped, 'disabled');

  // Clamp: 48h reminder vs 24h retention → idleHours 23
  const clamp = await runAbandonedCartReminders({ abandoned_cart_reminder_hours: '48', cart_retention_hours: '24' });
  assert.equal(clamp.idleHours, 23, JSON.stringify(clamp));
});

test('custom order create queues a confirmation email with the order number', async () => {
  const login = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  assert.equal(login.status, 200);

  const created = await api(srv.base, '/api/custom-orders', {
    method: 'POST',
    body: JSON.stringify({
      customerEmail: 'custom@test.com',
      customerName: 'Custom Tester',
      spec: {
        paperColor: 'Blush', paperTexture: 'textured', weight: '65lb',
        stemCount: 7, armatureHeightMm: 350, templateId: 'wattle-sprig',
        addGreenery: true, vaseIncluded: false, domeIncluded: false, ledIncluded: false,
      },
    }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body).slice(0, 300));
  assert.ok(created.body.orderNumber);

  const row = await prisma.emailQueue.findFirst({
    where: { template: 'custom_order_confirmation', to: 'custom@test.com' },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(row, 'custom_order_confirmation queued');
  assert.ok(row.text.includes(created.body.orderNumber), 'email carries the order number');
  assert.ok(row.text.includes('Blush'), 'email summarises the spec');
});
