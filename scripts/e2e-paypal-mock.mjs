// PayPal E2E against the running dev stack (port 3001, PAYPAL_MODE=mock).
// Flow: product → cart/add → paypal/create (idempotent) → capture → verify paid.
const BASE = process.env.BASE || 'http://localhost:3001';

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('ok -', msg); }

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const health = await api('/api/health');
assert(health.status === 200 && health.body.db, `backend healthy (db=${health.body.db})`);

const products = await api('/api/products');
const product = products.body.products.find((p) => p.slug === 'eucalyptus-paper-rose-bouquet-blush') || products.body.products[0];
assert(product, `product found: ${product.slug}`);

const cart = await api('/api/cart/add', { method: 'POST', body: { productId: product.id, quantity: 1 } });
const cartId = cart.body.cartId || cart.body.cart?.id;
assert(cartId, `cart created: ${cartId}`);

const checkout = {
  cartId,
  email: `e2e_${runId}@test.com`,
  shippingName: 'E2E PayPal Tester',
  shippingAddress: '1 Test St',
  shippingSuburb: 'Perth',
  shippingState: 'WA',
  shippingPostcode: '6000',
  paymentMethod: 'paypal',
};

const key = `e2e-pp-${runId}`;
const created = await api('/api/orders/paypal/create', { method: 'POST', headers: { 'Idempotency-Key': key }, body: checkout });
assert(created.status === 200, `create 200 (got ${created.status}: ${JSON.stringify(created.body).slice(0, 200)})`);
assert(created.body.order.status === 'pending_payment', 'order pending_payment');
assert(created.body.paypalOrderId === `MOCK-PP-${created.body.order.orderNumber}`, 'mock paypalOrderId derived from orderNumber');

const again = await api('/api/orders/paypal/create', { method: 'POST', headers: { 'Idempotency-Key': key }, body: checkout });
assert(again.body.order.orderNumber === created.body.order.orderNumber, 'idempotent create returns same order');
assert(again.body.paypalOrderId === created.body.paypalOrderId, 'idempotent create returns same paypal session');

const captured = await api('/api/orders/paypal/capture', { method: 'POST', body: { paypalOrderId: created.body.paypalOrderId } });
assert(captured.status === 200 && captured.body.captured === true, 'capture succeeded');
assert(captured.body.order.status === 'paid' && captured.body.order.paymentStatus === 'paid', 'order marked paid');

const recapture = await api('/api/orders/paypal/capture', { method: 'POST', body: { paypalOrderId: created.body.paypalOrderId } });
assert(recapture.status === 200 && recapture.body.captured === true, 'recapture idempotent');

const login = await api('/api/auth/login', { method: 'POST', body: { email: 'admin@krystal.local', password: 'admin123' } });
assert(login.status === 200 && login.body.token, 'admin login');
const list = await api('/api/orders?limit=50', { headers: { Authorization: `Bearer ${login.body.token}` } });
const seen = (Array.isArray(list.body) ? list.body : list.body.orders || []).find((o) => o.orderNumber === created.body.order.orderNumber);
assert(seen && seen.status === 'paid' && seen.paymentStatus === 'paid', 'admin list shows order paid');

console.log(`\nPayPal mock E2E PASSED — order ${created.body.order.orderNumber} (${created.body.paypalOrderId})`);
