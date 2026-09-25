import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';
import { enqueueEmail, drainEmailQueue } from '../src/services/email.js';

// Email queue durability — without SMTP configured, sendFromQueue marks the row
// failed (skipped) instead of retrying forever.
let srv;

before(async () => { srv = await startServer(); });
after(async () => {
  await prisma.emailQueue.deleteMany({ where: { subject: { startsWith: 'EmailQueue test' } } });
  await srv.close();
});

test('enqueueEmail persists and drain marks skipped when SMTP is missing', async () => {
  const row = await enqueueEmail({ to: 'queue_test@example.com', subject: 'EmailQueue test', text: 'hello', template: 'test' });
  assert.equal(row.status, 'pending');
  const res = await drainEmailQueue();
  assert.ok(res.drained >= 1);
  const after = await prisma.emailQueue.findUnique({ where: { id: row.id } });
  assert.equal(after.status, 'failed');
  assert.equal(after.lastError, 'SMTP not configured');
});

test('checkout enqueues an order confirmation email', async () => {
  const before = await prisma.emailQueue.count({ where: { template: 'order_confirmation' } });
  const { body: products } = await api(srv.base, '/api/products');
  const productId = products.products.find((p) => p.slug === 'eucalyptus-paper-rose-bouquet-blush').id;
  const { body: cartRes } = await api(srv.base, '/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity: 1 }) });
  const cartId = cartRes.cartId || cartRes.cart?.id;
  await api(srv.base, '/api/orders/checkout', {
    method: 'POST',
    body: JSON.stringify({ cartId, email: `queue_${Date.now()}@test.com`, shippingName: 'Q Buyer', shippingAddress: '1 Test St', shippingSuburb: 'Perth', shippingState: 'WA', shippingPostcode: '6000', paymentMethod: 'bank_transfer' }),
  });
  const after = await prisma.emailQueue.count({ where: { template: 'order_confirmation' } });
  assert.ok(after > before, 'an order_confirmation row was enqueued');
});
