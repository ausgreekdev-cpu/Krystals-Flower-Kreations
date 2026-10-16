import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import prisma from '../src/lib/prisma.js';
import { getObject } from '../src/services/storage.js';
import { startServer, api } from './helpers.js';

// Digital goods hardening: private-bucket SVG uploads, token-gated /api/dl
// delivery (paid-only), digital-only carts never pay shipping, confirmation
// emails carry working download links.
let srv;
let adminToken;
let productId;

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
const auth = () => ({ Authorization: `Bearer ${adminToken}` });

before(async () => {
  srv = await startServer();
  const login = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  assert.equal(login.status, 200, 'seeded developer login');
  adminToken = login.body.token;

  const slug = `dl-test-${Date.now()}`;
  const created = await api(srv.base, '/api/products', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({
      title: 'Digital Test Template', slug, description: 'x',
      type: 'digital_template', stockMode: 'digital', price: 14.95,
    }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  productId = created.body.id;
  globalThis.__dlSlug = slug;
});
after(async () => {
  if (productId) await api(srv.base, `/api/products/${productId}`, { method: 'DELETE', headers: auth() }).catch(() => {});
  await srv.close();
});

test('POST /api/products/:id/svg stores a private-bucket ref (not a public URL)', async () => {
  const fd = new FormData();
  fd.append('file', new Blob([SVG], { type: 'image/svg+xml' }), 'full.svg');
  const res = await fetch(`${srv.base}/api/products/${productId}/svg`, {
    method: 'POST', headers: auth(), body: fd,
  });
  const body = await res.json().catch(() => null);
  assert.equal(res.status, 201, JSON.stringify(body).slice(0, 300));
  assert.ok(body.svgUrl.startsWith('digital-assets/'), `private ref, got ${body.svgUrl}`);
  assert.ok(!body.svgUrl.startsWith('http'), 'never a public URL');
});

test('SVG upload rejects non-SVG files', async () => {
  const fd = new FormData();
  fd.append('file', new Blob(['MZ-not-an-svg'], { type: 'application/zip' }), 'evil.zip');
  const res = await fetch(`${srv.base}/api/products/${productId}/svg`, {
    method: 'POST', headers: auth(), body: fd,
  });
  assert.equal(res.status, 415);
});

test('digital-only checkout: shipping is $0 and lines carry downloadUrl', async () => {
  const add = await api(srv.base, '/api/cart/add', {
    method: 'POST',
    body: JSON.stringify({ productId, quantity: 1 }),
  });
  assert.equal(add.status, 200, JSON.stringify(add.body).slice(0, 200));
  const cartId = add.body.cartId || add.body.cart?.id;

  const checkout = await api(srv.base, '/api/orders/checkout', {
    method: 'POST',
    body: JSON.stringify({
      cartId,
      email: 'dl-buyer@test.com',
      shippingName: 'DL Buyer', shippingAddress: '1 Test St', shippingSuburb: 'Perth',
      shippingState: 'WA', shippingPostcode: '6000', paymentMethod: 'bank_transfer',
    }),
  });
  assert.equal(checkout.status, 200, JSON.stringify(checkout.body).slice(0, 300));
  assert.equal(Number(checkout.body.order.shippingCost), 0, 'digital-only cart pays no shipping');
  const digital = checkout.body.order.lines.filter((l) => l.isDigital);
  assert.equal(digital.length, 1);
  assert.ok(digital[0].downloadUrl?.startsWith('/api/dl/'), `downloadUrl minted, got ${digital[0].downloadUrl}`);
  globalThis.__dlOrderId = checkout.body.order.id;
  globalThis.__dlToken = digital[0].downloadUrl.split('/api/dl/')[1];
});

test('confirmation email queue text contains the download link', async () => {
  const order = await prisma.order.findUnique({ where: { id: globalThis.__dlOrderId }, include: { lines: true } });
  assert.ok(order, 'order exists');
  const row = await prisma.emailQueue.findFirst({
    where: { subject: { contains: order.orderNumber }, template: 'order_confirmation' },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(row, 'confirmation email queued');
  assert.ok(row.text.includes('/api/dl/'), 'email text has download link');
});

test('GET /api/dl/:token returns 402 while unpaid', async () => {
  const res = await fetch(`${srv.base}/api/dl/${globalThis.__dlToken}`);
  const body = await res.json().catch(() => null);
  assert.equal(res.status, 402, JSON.stringify(body));
  assert.equal(body.code, 'payment_required');
});

test('once staff mark the order paid, the emailed link serves the SVG', async () => {
  const status = await api(srv.base, `/api/orders/${globalThis.__dlOrderId}/status`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ status: 'paid', note: 'bank transfer received' }),
  });
  assert.equal(status.status, 200, JSON.stringify(status.body).slice(0, 300));

  const res = await fetch(`${srv.base}/api/dl/${globalThis.__dlToken}`);
  assert.equal(res.status, 200, 'download unlocked after payment');
  assert.match(res.headers.get('content-type') || '', /image\/svg\+xml/);
  assert.match(res.headers.get('content-disposition') || '', /attachment/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const text = await res.text();
  assert.ok(text.includes('<svg'), 'serves the uploaded SVG bytes');
});

test('GET /api/dl/:token 404s on bogus and expired tokens', async () => {
  const bogus = await fetch(`${srv.base}/api/dl/not-a-real-token`);
  assert.equal(bogus.status, 404);
  const bogusBody = await bogus.json().catch(() => null);
  assert.equal(bogusBody.code, 'invalid_download_token');

  // Expired token signed with the same secret the dev server uses
  const expired = jwt.sign({ lineId: 'x', purpose: 'dl' }, process.env.JWT_SECRET || 'dev-secret-change-me', { expiresIn: -60 });
  const res = await fetch(`${srv.base}/api/dl/${expired}`);
  assert.equal(res.status, 404);
});

test('mixed cart (digital + physical) still pays shipping', async () => {
  // Find any physical product from the seeded catalogue
  const { body } = await api(srv.base, '/api/products?limit=50');
  const physical = body.products.find((p) => p.stockMode !== 'digital');
  assert.ok(physical, 'seeded physical product available');

  const addD = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity: 1 }) });
  assert.equal(addD.status, 200, JSON.stringify(addD.body).slice(0, 200));
  const cartId = addD.body.cartId || addD.body.cart?.id;
  const addP = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId: physical.id, quantity: 1, cartId }) });
  assert.equal(addP.status, 200, JSON.stringify(addP.body).slice(0, 200));

  const checkout = await api(srv.base, '/api/orders/checkout', {
    method: 'POST',
    body: JSON.stringify({
      cartId,
      email: 'mixed-buyer@test.com',
      shippingName: 'Mixed Buyer', shippingAddress: '2 Test St', shippingSuburb: 'Perth',
      shippingState: 'WA', shippingPostcode: '6000', paymentMethod: 'bank_transfer',
    }),
  });
  assert.equal(checkout.status, 200, JSON.stringify(checkout.body).slice(0, 300));
  assert.ok(Number(checkout.body.order.shippingCost) > 0, 'mixed cart pays shipping');
  // cleanup the mixed order so repeat runs stay clean
  await api(srv.base, `/api/orders/${checkout.body.order.id}/status`, {
    method: 'PATCH', headers: auth(), body: JSON.stringify({ status: 'cancelled', note: 'test cleanup' }),
  }).catch(() => {});
});

// ── Phase 4: digital-delivery hardening ──────────────────────────────────

const uploadSvg = async (content, name = 't.svg') => {
  const fd = new FormData();
  fd.append('file', new Blob([content], { type: 'image/svg+xml' }), name);
  const res = await fetch(`${srv.base}/api/products/${productId}/svg`, { method: 'POST', headers: auth(), body: fd });
  return { res, body: await res.json().catch(() => null) };
};

test('public product responses hide svgUrl and cost; staff view keeps them', async () => {
  const pub = await api(srv.base, `/api/products/${globalThis.__dlSlug}`);
  assert.equal(pub.status, 200, JSON.stringify(pub.body).slice(0, 200));
  assert.ok(!('svgUrl' in pub.body), 'detail hides svgUrl');
  assert.ok(!('cost' in pub.body), 'detail hides cost');

  const list = await api(srv.base, '/api/products?limit=100');
  const row = list.body.products.find((p) => p.id === productId);
  assert.ok(row, 'product in public list');
  assert.ok(!('svgUrl' in row), 'list hides svgUrl');
  assert.ok(!('cost' in row), 'list hides cost');

  const staff = await api(srv.base, `/api/products/${globalThis.__dlSlug}`, { headers: auth() });
  assert.ok('svgUrl' in staff.body, 'staff detail keeps svgUrl');
  assert.ok('cost' in staff.body, 'staff detail keeps cost');

  const staffList = await api(srv.base, '/api/products?limit=100&all=1', { headers: auth() });
  const staffRow = staffList.body.products.find((p) => p.id === productId);
  assert.ok(staffRow && 'svgUrl' in staffRow && 'cost' in staffRow, 'staff list keeps both');
});

test('cart lines and blog embeds strip internal product fields', async () => {
  const add = await api(srv.base, '/api/cart/add', {
    method: 'POST', body: JSON.stringify({ productId, quantity: 1 }),
  });
  assert.equal(add.status, 200, JSON.stringify(add.body).slice(0, 200));
  const cartProduct = add.body.cart?.items?.[0]?.product;
  assert.ok(cartProduct, 'cart line embeds product');
  assert.ok(!('svgUrl' in cartProduct), 'cart hides svgUrl');
  assert.ok(!('cost' in cartProduct), 'cart hides cost');
  const cartId = add.body.cartId || add.body.cart?.id;
  const getCart = await api(srv.base, '/api/cart', { headers: { 'x-cart-id': cartId } });
  const getCartProduct = getCart.body.items?.[0]?.product || getCart.body.cart?.items?.[0]?.product;
  assert.ok(getCartProduct && !('svgUrl' in getCartProduct) && !('cost' in getCartProduct), 'GET cart hides internals');

  const bslug = `dl-blog-${Date.now()}`;
  const post = await api(srv.base, '/api/posts', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ title: 'DL Embed Test', slug: bslug, status: 'published', productIds: [productId] }),
  });
  assert.equal(post.status, 201, JSON.stringify(post.body).slice(0, 200));
  const read = await api(srv.base, `/api/posts/${bslug}`);
  const embedded = read.body.products?.[0]?.product;
  assert.ok(embedded, 'post embeds product');
  assert.ok(!('svgUrl' in embedded), 'post embed hides svgUrl');
  assert.ok(!('cost' in embedded), 'post embed hides cost');
  await api(srv.base, `/api/posts/${post.body.id}`, { method: 'DELETE', headers: auth() }).catch(() => {});
});

test('SVG upload strips active content (script, handlers, javascript: URLs)', async () => {
  const nasty = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">'
    + '<script>alert(1)</script><rect width="10" height="10" onload="alert(2)"/>'
    + '<a href="javascript:alert(3)"><text>x</text></a></svg>';
  const { res, body } = await uploadSvg(nasty, 'nasty.svg');
  assert.equal(res.status, 201, JSON.stringify(body).slice(0, 200));
  const stored = (await getObject(body.svgUrl)).toString('utf8');
  assert.ok(!stored.includes('<script'), 'no script element');
  assert.ok(!/onload/i.test(stored), 'no event handler');
  assert.ok(!stored.toLowerCase().includes('javascript:'), 'no javascript: URL');
  assert.ok(stored.includes('<svg'), 'still an svg');
});

test('SVG upload removes editor debris but keeps geometry, ids and viewBox', async () => {
  const debris = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">'
    + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10">'
    + '<!-- editor comment --><metadata><rdf:RDF>junk</rdf:RDF></metadata>'
    + '<g id="layer1"><path id="cut" d="M0 0 L20 0 L20 10 Z"/></g></svg>';
  const { res, body } = await uploadSvg(debris, 'debris.svg');
  assert.equal(res.status, 201, JSON.stringify(body).slice(0, 200));
  const stored = (await getObject(body.svgUrl)).toString('utf8');
  assert.ok(!stored.includes('<!--'), 'comments removed');
  assert.ok(!stored.includes('<metadata'), 'metadata removed');
  assert.ok(!/DOCTYPE/i.test(stored), 'doctype removed');
  assert.ok(!stored.includes('<?xml'), 'xml prolog removed');
  assert.ok(stored.includes('viewBox="0 0 20 10"'), 'viewBox kept');
  assert.ok(stored.includes('id="layer1"') && stored.includes('id="cut"'), 'ids kept');
  assert.ok(stored.includes('d="M0 0 L20 0 L20 10 Z"'), 'path geometry byte-stable');
});
