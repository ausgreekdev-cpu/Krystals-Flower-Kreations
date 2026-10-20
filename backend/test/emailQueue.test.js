import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';
import { enqueueEmail, drainEmailQueue, sendFromQueue, emailProviderStatus } from '../src/services/email.js';

// Email queue durability — with no provider configured, sendFromQueue marks the
// row failed (skipped) instead of retrying forever. With a provider key set, the
// queue sends over HTTPS and a 4xx (bad key / unverified domain) is parked as
// failed rather than retried five times.
let srv;

before(async () => { srv = await startServer(); });
after(async () => {
  await prisma.emailQueue.deleteMany({ where: { subject: { startsWith: 'EmailQueue test' } } });
  await srv.close();
});

// Stub global fetch for one test without leaking the stub into the next suite.
async function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = original; }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('enqueueEmail persists and drain marks skipped when no provider is configured', async () => {
  const row = await enqueueEmail({ to: 'queue_test@example.com', subject: 'EmailQueue test', text: 'hello', template: 'test' });
  assert.equal(row.status, 'pending');
  const res = await drainEmailQueue();
  assert.ok(res.drained >= 1);
  const after = await prisma.emailQueue.findUnique({ where: { id: row.id } });
  assert.equal(after.status, 'failed');
  assert.equal(after.lastError, 'Email provider not configured');
});

test('placeholder SMTP values on the site are treated as unconfigured', async () => {
  // Prod carried SMTP_HOST/SMTP_USER/SMTP_PASS=... for months; dialling a host
  // named "..." used to look "configured" and fail on every send.
  const saved = { SMTP_HOST: process.env.SMTP_HOST, SMTP_USER: process.env.SMTP_USER, SMTP_PASS: process.env.SMTP_PASS };
  process.env.SMTP_HOST = '...';
  process.env.SMTP_USER = '...';
  process.env.SMTP_PASS = '...';
  try {
    assert.equal(emailProviderStatus().configured, false);
    assert.equal(emailProviderStatus().provider, null);
    const row = await enqueueEmail({ to: 'queue_test@example.com', subject: 'EmailQueue test placeholder', text: 'hi', template: 'test' });
    const r = await sendFromQueue(row);
    assert.equal(r.skipped, true);
    const after = await prisma.emailQueue.findUnique({ where: { id: row.id } });
    assert.equal(after.status, 'failed');
    assert.equal(after.lastError, 'Email provider not configured');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('a configured API key sends over HTTPS and stamps the row sent', async () => {
  process.env.RESEND_API_KEY = 're_test_key_123';
  try {
    const calls = [];
    await withFetch(async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ id: 'msg_abc' }, 200);
    }, async () => {
      const row = await enqueueEmail({ to: 'provider@example.com', subject: 'EmailQueue test resend', text: 'hello there', template: 'test' });
      const r = await sendFromQueue(row);
      assert.deepEqual(r, { sent: true });
      const stored = await prisma.emailQueue.findUnique({ where: { id: row.id } });
      assert.equal(stored.status, 'sent');
      assert.equal(stored.lastError, null);
      assert.ok(stored.sentAt);
    });

    assert.equal(calls.length, 1, 'one HTTPS request per email');
    assert.equal(calls[0].url, 'https://api.resend.com/emails');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test_key_123');
    const body = JSON.parse(calls[0].init.body);
    assert.deepEqual(body.to, ['provider@example.com']);
    assert.match(body.from, /@krystalsflowercreations\.com\.au>$/);
    assert.equal(body.subject, 'EmailQueue test resend');
    assert.equal(body.text, 'hello there');
    assert.equal(body.html, undefined, 'plain-text mail is not relabelled as HTML');
  } finally {
    delete process.env.RESEND_API_KEY;
  }
});

test('postmark and sendgrid are wired with their own payload shapes', async () => {
  const saved = { POSTMARK_SERVER_TOKEN: process.env.POSTMARK_SERVER_TOKEN, SENDGRID_API_KEY: process.env.SENDGRID_API_KEY };
  try {
    // Postmark: X-Postmark-Server-Token header, PascalCase body, JSON id
    process.env.POSTMARK_SERVER_TOKEN = 'pm_test_token';
    const pmCalls = [];
    await withFetch(async (url, init) => { pmCalls.push({ url, init }); return jsonResponse({ MessageID: 'pm_1' }, 200); }, async () => {
      const row = await enqueueEmail({ to: 'pm@example.com', subject: 'EmailQueue test postmark', text: 'hi', template: 'test' });
      assert.equal((await sendFromQueue(row)).sent, true);
    });
    assert.equal(pmCalls[0].url, 'https://api.postmarkapp.com/email');
    assert.equal(pmCalls[0].init.headers['X-Postmark-Server-Token'], 'pm_test_token');
    const pmBody = JSON.parse(pmCalls[0].init.body);
    assert.equal(pmBody.From, 'Krystals Flower Creations <orders@krystalsflowercreations.com.au>');
    assert.equal(pmBody.To, 'pm@example.com');
    assert.equal(pmBody.TextBody, 'hi');
    assert.equal(pmBody.MessageStream, 'outbound');
    delete process.env.POSTMARK_SERVER_TOKEN;

    // SendGrid: bearer auth, personalizations/content arrays, 202 with an empty body
    process.env.SENDGRID_API_KEY = 'sg_test_key';
    const sgCalls = [];
    await withFetch(async (url, init) => { sgCalls.push({ url, init }); return new Response(null, { status: 202, headers: { 'x-message-id': 'sg_1' } }); }, async () => {
      const row = await enqueueEmail({ to: 'sg@example.com', subject: 'EmailQueue test sendgrid', text: 'hi', template: 'test' });
      assert.equal((await sendFromQueue(row)).sent, true);
      const stored = await prisma.emailQueue.findUnique({ where: { id: row.id } });
      assert.equal(stored.status, 'sent', '202 with no body still counts as sent');
    });
    assert.equal(sgCalls[0].url, 'https://api.sendgrid.com/v3/mail/send');
    assert.equal(sgCalls[0].init.headers.Authorization, 'Bearer sg_test_key');
    const sgBody = JSON.parse(sgCalls[0].init.body);
    assert.deepEqual(sgBody.personalizations[0].to, [{ email: 'sg@example.com' }]);
    assert.deepEqual(sgBody.from, { name: 'Krystals Flower Creations', email: 'orders@krystalsflowercreations.com.au' });
    assert.deepEqual(sgBody.content, [{ type: 'text/plain', value: 'hi' }]);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('a 4xx from the provider fails the row immediately instead of retrying', async () => {
  process.env.RESEND_API_KEY = 're_bad_key';
  try {
    await withFetch(async () => jsonResponse({ statusCode: 401, name: 'validation_error', message: 'API key is invalid' }, 401), async () => {
      const row = await enqueueEmail({ to: 'provider@example.com', subject: 'EmailQueue test 401', text: 'hi', template: 'test' });
      const r = await sendFromQueue(row);
      assert.equal(r.failed, true);
      const stored = await prisma.emailQueue.findUnique({ where: { id: row.id } });
      assert.equal(stored.status, 'failed');
      assert.equal(stored.attempts, 1, 'no hourly retry loop on a permanent error');
      assert.match(stored.lastError, /resend 401: API key is invalid/);
    });
  } finally {
    delete process.env.RESEND_API_KEY;
  }
});

test('a 5xx from the provider stays pending for the next drain', async () => {
  process.env.RESEND_API_KEY = 're_test_key_123';
  try {
    await withFetch(async () => jsonResponse({ message: 'upstream unavailable' }, 503), async () => {
      const row = await enqueueEmail({ to: 'provider@example.com', subject: 'EmailQueue test 503', text: 'hi', template: 'test' });
      const r = await sendFromQueue(row);
      assert.equal(r.retry, true);
      const stored = await prisma.emailQueue.findUnique({ where: { id: row.id } });
      assert.equal(stored.status, 'pending');
      assert.equal(stored.attempts, 1);
      assert.match(stored.lastError, /resend 503/);
    });
  } finally {
    delete process.env.RESEND_API_KEY;
  }
});

test('a network error stays pending rather than marking the email failed', async () => {
  process.env.RESEND_API_KEY = 're_test_key_123';
  try {
    await withFetch(async () => { throw new Error('fetch failed'); }, async () => {
      const row = await enqueueEmail({ to: 'provider@example.com', subject: 'EmailQueue test network', text: 'hi', template: 'test' });
      const r = await sendFromQueue(row);
      assert.equal(r.retry, true);
      const stored = await prisma.emailQueue.findUnique({ where: { id: row.id } });
      assert.equal(stored.status, 'pending');
      assert.match(stored.lastError, /fetch failed/);
    });
  } finally {
    delete process.env.RESEND_API_KEY;
  }
});

test('checkout enqueues an order confirmation email', async () => {
  const before = await prisma.emailQueue.count({ where: { template: 'order_confirmation' } });
  const { body: products } = await api(srv.base, '/api/products');
  const productId = products.products.find((p) => p.slug === 'eucalyptus-paper-rose-bouquet-blush').id;
  const { body: cartRes } = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity: 1 }) });
  const cartId = cartRes.cartId || cartRes.cart?.id;
  const { body: checkout } = await api(srv.base, '/api/orders/checkout', {
    method: 'POST',
    body: JSON.stringify({ cartId, email: `queue_${Date.now()}@test.com`, shippingName: 'Q Buyer', shippingAddress: '1 Test St', shippingSuburb: 'Perth', shippingState: 'WA', shippingPostcode: '6000', paymentMethod: 'bank_transfer' }),
  });
  const after = await prisma.emailQueue.count({ where: { template: 'order_confirmation' } });
  assert.ok(after > before, 'an order_confirmation row was enqueued');
  // Florist enrichment: the seeded rose bouquet carries care + occasions
  const confirm = await prisma.emailQueue.findFirst({ where: { template: 'order_confirmation', payload: { path: ['orderNumber'], equals: checkout.order.orderNumber } } });
  assert.ok(confirm, 'confirmation row for this order');
  assert.match(confirm.text, /Care & occasions:/);
  assert.match(confirm.text, /Care: Keep dry and away from direct sun/);
  assert.match(confirm.text, /Perfect for: birthday, anniversary, mothers-day/);
});
