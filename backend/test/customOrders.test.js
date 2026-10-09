import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';

let srv;

function spec(overrides = {}) {
  return {
    paperColor: 'Blush', paperTexture: 'textured', weight: '65lb',
    stemCount: 7, armatureHeightMm: 350, templateId: 'wattle-sprig',
    addGreenery: false, vaseIncluded: false,
    ...overrides,
  };
}

before(async () => { srv = await startServer(); });

after(async () => {
  await srv.close();
  const orders = await prisma.customArtOrder.findMany({ where: { customerEmail: { endsWith: '@test.com' } }, select: { id: true } });
  const ids = orders.map(o => o.id);
  if (ids.length) {
    await prisma.ticket.deleteMany({ where: { customArtOrderId: { in: ids } } });
    await prisma.customArtOrderHistory.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.customArtOrder.deleteMany({ where: { id: { in: ids } } });
  }
});

test('create custom order with dome + LED add-ons — spec round-trips, price and minutes increase', async () => {
  const settings = await api(srv.base, '/api/settings');
  const domeP = Number(settings.body?.configurator_dome) || 45;
  const ledP = Number(settings.body?.configurator_led) || 18;
  const base = await api(srv.base, '/api/custom-orders', {
    method: 'POST',
    body: JSON.stringify({ customerEmail: 'addons-base@test.com', customerName: 'Test Base', spec: spec() }),
  });
  assert.equal(base.status, 201, JSON.stringify(base.body));
  const addons = await api(srv.base, '/api/custom-orders', {
    method: 'POST',
    body: JSON.stringify({
      customerEmail: 'addons-full@test.com', customerName: 'Test Full',
      spec: spec({ domeIncluded: true, ledIncluded: true, palette: 'romantic-blush' }),
    }),
  });
  assert.equal(addons.status, 201, JSON.stringify(addons.body));
  assert.equal(addons.body.spec.domeIncluded, true);
  assert.equal(addons.body.spec.ledIncluded, true);
  assert.equal(addons.body.spec.palette, 'romantic-blush');
  const dPrice = Number(addons.body.totalPrice) - Number(base.body.totalPrice);
  assert.ok(dPrice >= domeP + ledP - 0.011, `dome+LED price delta >= dome+led settings (got ${dPrice}, expect >= ${domeP + ledP})`);
  assert.ok(addons.body.estimatedMinutes > base.body.estimatedMinutes, 'dome+LED add craft minutes');
  assert.equal(addons.body.state, 'drafting_proofing');
  assert.ok(addons.body.ticket?.qrPayload, 'QR ticket issued');
});

test('spec defaults for missing add-on flags are false', async () => {
  const res = await api(srv.base, '/api/custom-orders', {
    method: 'POST',
    body: JSON.stringify({ customerEmail: 'addons-defaults@test.com', customerName: 'Test Defaults', spec: spec() }),
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.spec.domeIncluded, false);
  assert.equal(res.body.spec.ledIncluded, false);
  assert.equal(res.body.spec.palette ?? null, null);
});

test('rejects stemCount above 25', async () => {
  const res = await api(srv.base, '/api/custom-orders', {
    method: 'POST',
    body: JSON.stringify({ customerEmail: 'addons-invalid@test.com', customerName: 'Test Invalid', spec: spec({ stemCount: 26 }) }),
  });
  assert.equal(res.status, 400);
});
