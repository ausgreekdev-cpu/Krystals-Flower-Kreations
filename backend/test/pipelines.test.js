import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/lib/prisma.js';
import { startServer, api } from './helpers.js';

let srv;
let adminToken;
const auth = () => ({ Authorization: `Bearer ${adminToken}` });
const UNIQUE = Date.now().toString(36);

before(async () => {
  srv = await startServer();
  const login = await api(srv.base, '/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  assert.equal(login.status, 200);
  adminToken = login.body.token;
});

after(async () => {
  await srv.close();
});

test('procurement drafts endpoint responds', async () => {
  const res = await api(srv.base, '/api/procurement/drafts', { headers: auth() });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test('rebalance endpoint responds', async () => {
  const res = await api(srv.base, '/api/inventory/rebalance', { headers: auth() });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test('production runs list endpoint responds', async () => {
  const res = await api(srv.base, '/api/production-runs', { headers: auth() });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test('substitutes endpoint responds for a material', async () => {
  // create a material first
  const mat = await prisma.rawMaterial.create({
    data: { sku: `PI-${UNIQUE}-SUB`, name: 'Test Sub Material', unit: 'sheet', costPerUnit: 1, onHand: 10, lowThreshold: 5 },
  });
  const res = await api(srv.base, `/api/bom/materials/${mat.id}/substitutes`, { headers: auth() });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  await prisma.rawMaterial.delete({ where: { id: mat.id } }).catch(() => {});
});

test('QC endpoint sets status on an order', async () => {
  // Need an order — skip if none exist
  const orders = await prisma.order.findMany({ take: 1 });
  if (!orders.length) return;
  const res = await api(srv.base, `/api/orders/${orders[0].id}/qc`, {
    method: 'PATCH', headers: auth(),
    body: JSON.stringify({ qcStatus: 'passed', qcNotes: 'looks good' }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.qcStatus, 'passed');
});

test('replenish endpoint responds', async () => {
  const res = await api(srv.base, '/api/procurement/replenish', { method: 'POST', headers: auth() });
  assert.equal(res.status, 200);
  assert.ok(typeof res.body.created === 'number');
});
