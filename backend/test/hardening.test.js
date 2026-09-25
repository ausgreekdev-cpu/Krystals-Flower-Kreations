import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';

// Batch A regression tests: status machine/restock, IDOR, role escalation, health.
let srv;
let adminToken;
let customerToken;
let customerUserId;
const customerEmail = `hardening_${Date.now()}@test.com`;

before(async () => {
  srv = await startServer();
  const admin = await api(srv.base, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }) });
  adminToken = admin.body.token;
  const me = await api(srv.base, '/api/auth/me', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(me.status, 200);
  const reg = await api(srv.base, '/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Hardening Tester', email: customerEmail, password: 'secret123' }) });
  customerToken = reg.body.token;
  const cme = await api(srv.base, '/api/auth/me', { headers: { Authorization: `Bearer ${customerToken}` } });
  customerUserId = cme.body.user.id;
});
after(async () => { await srv.close(); });

test('health returns db:true', async () => {
  const { status, body } = await api(srv.base, '/api/health');
  assert.equal(status, 200);
  assert.equal(body.db, true);
});

test('order status: refunded cannot go back to paid', async () => {
  const { body: list } = await api(srv.base, '/api/products');
  const productId = list.products.find((p) => p.slug === 'eucalyptus-paper-rose-bouquet-blush').id;
  const { body: cartRes } = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity: 1 }) });
  const cartId = cartRes.cartId || cartRes.cart?.id;
  const { body: co } = await api(srv.base, '/api/orders/checkout', {
    method: 'POST',
    body: JSON.stringify({ cartId, email: customerEmail, shippingName: 'Hardening Buyer', shippingAddress: '1 Test St', shippingSuburb: 'Perth', shippingState: 'WA', shippingPostcode: '6000', paymentMethod: 'bank_transfer' }),
  });
  const orderId = co.order.id;
  // pending_payment → refunded (valid)
  const r1 = await api(srv.base, `/api/orders/${orderId}/status`, { method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ status: 'refunded' }) });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  // refunded → paid must be rejected
  const r2 = await api(srv.base, `/api/orders/${orderId}/status`, { method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ status: 'paid' }) });
  assert.equal(r2.status, 409);
  assert.equal(r2.body.code, 'invalid_transition');
});

test('cancelling a tracked order restocks its stock', async () => {
  // Seeded tracked products have no variants — use the default-location InventoryLevel path.
  const levels = await api(srv.base, '/api/inventory/levels', { headers: { Authorization: `Bearer ${adminToken}` } });
  const lvl = levels.body.find((l) => l.product?.stockMode === 'tracked' && l.variantId === null);
  assert.ok(lvl, 'a tracked product with an inventory level');
  const beforeQty = lvl.onHand;
  const { body: cartRes } = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId: lvl.productId, quantity: 1 }) });
  const cartId = cartRes.cartId || cartRes.cart?.id;
  const { body: co } = await api(srv.base, '/api/orders/checkout', {
    method: 'POST',
    body: JSON.stringify({ cartId, email: customerEmail, shippingName: 'Hardening Buyer', shippingAddress: '1 Test St', shippingSuburb: 'Perth', shippingState: 'WA', shippingPostcode: '6000', paymentMethod: 'bank_transfer' }),
  });
  assert.equal(co.order.status, 'pending_payment');
  const mid = await api(srv.base, '/api/inventory/levels', { headers: { Authorization: `Bearer ${adminToken}` } });
  const midLvl = mid.body.find((l) => l.id === lvl.id);
  assert.equal(midLvl.onHand, beforeQty - 1);
  const rc = await api(srv.base, `/api/orders/${co.order.id}/status`, { method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ status: 'cancelled' }) });
  assert.equal(rc.status, 200, JSON.stringify(rc.body));
  const after = await api(srv.base, '/api/inventory/levels', { headers: { Authorization: `Bearer ${adminToken}` } });
  const restored = after.body.find((l) => l.id === lvl.id);
  assert.equal(restored.onHand, beforeQty);
});

test('cart update with a foreign cartId is rejected', async () => {
  const { body: list } = await api(srv.base, '/api/products');
  const productId = list.products.find((p) => p.slug === 'eucalyptus-paper-rose-bouquet-blush').id;
  const { body: cartRes } = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity: 1 }) });
  const cartId = cartRes.cartId || cartRes.cart?.id;
  const itemId = cartRes.cart?.items?.[0]?.id;
  assert.ok(itemId);
  const { status } = await api(srv.base, '/api/cart/update', {
    method: 'POST',
    body: JSON.stringify({ itemId, cartId: 'foreigncartid1234567890', quantity: 5 }),
  });
  assert.equal(status, 404);
  // correct cartId works
  const ok = await api(srv.base, '/api/cart/update', { method: 'POST', body: JSON.stringify({ itemId, cartId, quantity: 5 }) });
  assert.equal(ok.status, 200);
});

test('non-owner customer cannot fetch another booking ticket', async () => {
  // customer books a workshop
  const { body: workshops } = await api(srv.base, '/api/workshops');
  const ws = workshops.find((w) => w.sessions?.some((s) => new Date(s.startsAt) > new Date() && s.bookedCount < s.capacity));
  assert.ok(ws);
  const session = ws.sessions.find((s) => new Date(s.startsAt) > new Date() && s.bookedCount < s.capacity);
  const booked = await api(srv.base, `/api/workshops/sessions/${session.id}/book`, { method: 'POST', body: JSON.stringify({ name: 'Owner', email: customerEmail, quantity: 1 }) });
  assert.equal(booked.status, 201, JSON.stringify(booked.body));
  if (booked.body.ticket) {
    // another customer should be forbidden
    const other = await api(srv.base, '/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Other', email: `other_${Date.now()}@test.com`, password: 'secret123' }) });
    const { status } = await api(srv.base, `/api/tickets/${encodeURIComponent(booked.body.ticket.qrPayload)}`, { headers: { Authorization: `Bearer ${other.body.token}` } });
    assert.equal(status, 403);
    // owner can fetch
    const own = await api(srv.base, `/api/tickets/${encodeURIComponent(booked.body.ticket.qrPayload)}`, { headers: { Authorization: `Bearer ${customerToken}` } });
    assert.equal(own.status, 200);
  }
});

test('admin cannot promote a user to developer', async () => {
  // admin@krystal.local is role 'developer'; use the seeded role 'admin' account
  const login = await api(srv.base, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'krystal@flowerkreations.com.au', password: 'admin123' }) });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const adminRoleToken = login.body.token;
  const { status, body } = await api(srv.base, `/api/users/${customerUserId}/role`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminRoleToken}` },
    body: JSON.stringify({ role: 'developer' }),
  });
  assert.equal(status, 403);
  assert.equal(body.code, 'forbidden');
});

test('admin CAN promote a user to staff', async () => {
  const { status } = await api(srv.base, `/api/users/${customerUserId}/role`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ role: 'staff' }),
  });
  assert.equal(status, 200);
});
