import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';

let srv;
let token;
let custToken;
const uniq = Date.now().toString(36);
const SUP_A = `Sup Test A ${uniq}`;
const SUP_B = `Sup Test B ${uniq}`;
const supIds = [];
const matIds = [];
const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  srv = await startServer();
  const login = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  assert.equal(login.status, 200, 'seeded developer login');
  token = login.body.token;
  const email = `sup-cust-${uniq}@example.com`;
  const reg = await api(srv.base, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Sup Cust', email, password: 'secret123' }),
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  custToken = reg.body.token;
});

after(async () => {
  if (matIds.length) await prisma.rawMaterial.deleteMany({ where: { id: { in: matIds } } }).catch(() => {});
  if (supIds.length) await prisma.supplier.deleteMany({ where: { id: { in: supIds } } }).catch(() => {});
  await srv.close();
});

test('suppliers require auth; customer role gets 403', async () => {
  const guest = await api(srv.base, '/api/suppliers');
  assert.ok([401, 403].includes(guest.status), `expected 401/403, got ${guest.status}`);
  const cust = await api(srv.base, '/api/suppliers', { headers: { Authorization: `Bearer ${custToken}` } });
  assert.equal(cust.status, 403, 'customer token must not read suppliers');
});

test('supplier CRUD round-trip with search and unique-name conflict', async () => {
  const create = await api(srv.base, '/api/suppliers', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name: SUP_A, contact: 'Sam', email: 'sam@example.com', phone: '0400000000', website: 'https://sam.example.com', address: '1 Test St', notes: 'friendly' }),
  });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  supIds.push(create.body.id);
  assert.equal(create.body.contact, 'Sam');
  assert.equal(create.body.isActive, true);
  assert.deepEqual(create.body._count, { rawMaterials: 0, purchaseOrders: 0 });

  const dup = await api(srv.base, '/api/suppliers', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name: SUP_A }),
  });
  assert.equal(dup.status, 409, JSON.stringify(dup.body));
  assert.match(dup.body.error, /already exists/i);

  const list = await api(srv.base, `/api/suppliers?q=${encodeURIComponent(SUP_A.slice(0, 12))}`, { headers: auth() });
  assert.equal(list.status, 200);
  const row = (list.body || []).find((s) => s.name === SUP_A);
  assert.ok(row, 'created supplier appears in search');

  const patch = await api(srv.base, `/api/suppliers/${create.body.id}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ contact: 'Samantha', isActive: false }),
  });
  assert.equal(patch.status, 200, JSON.stringify(patch.body));
  assert.equal(patch.body.contact, 'Samantha');
  assert.equal(patch.body.isActive, false);

  const missing = await api(srv.base, `/api/suppliers/${'no-such-' + uniq}`, { headers: auth() });
  assert.equal(missing.status, 404);
});

test('supplier detail returns linked materials and POs', async () => {
  const create = await api(srv.base, '/api/suppliers', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name: SUP_B }),
  });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  supIds.push(create.body.id);

  const mat = await api(srv.base, '/api/materials', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ sku: `RM-SUP-${uniq}`, name: 'Supplier-linked stock', unit: 'sheet', supplierId: create.body.id }),
  });
  assert.equal(mat.status, 201, JSON.stringify(mat.body));
  matIds.push(mat.body.id);
  assert.equal(mat.body.supplierId, create.body.id, 'material carries supplier link');

  const detail = await api(srv.base, `/api/suppliers/${create.body.id}`, { headers: auth() });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.rawMaterials.length, 1);
  assert.equal(detail.body._count.rawMaterials, 1);
  assert.ok(detail.body.stats, 'detail carries stats');
  assert.equal(detail.body.stats.totalSpend, 0, 'no POs yet');

  const blocked = await api(srv.base, `/api/suppliers/${create.body.id}`, { method: 'DELETE', headers: auth() });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.match(blocked.body.error, /deactivate instead/i);
});

test('list + detail report spend, last order and open PO stats', async () => {
  const name = `Sup Spend ${uniq}`;
  const sup = await api(srv.base, '/api/suppliers', {
    method: 'POST', headers: auth(), body: JSON.stringify({ name }),
  });
  assert.equal(sup.status, 201, JSON.stringify(sup.body));
  supIds.push(sup.body.id);

  const mat = await api(srv.base, '/api/materials', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ sku: `RM-SPEND-${uniq}`, name: 'Spend test stock', unit: 'sheet' }),
  });
  assert.equal(mat.status, 201, JSON.stringify(mat.body));
  matIds.push(mat.body.id);

  // PO #1: 10 @ $2.50 = $25 (still open — status ordered)
  const po1 = await api(srv.base, '/api/purchase-orders', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ supplier: name, lines: [{ rawMaterialId: mat.body.id, qty: 10, unitCost: 2.5 }] }),
  });
  assert.equal(po1.status, 201, JSON.stringify(po1.body));
  assert.equal(po1.body.supplierId, sup.body.id, 'PO auto-links supplier');
  // PO #2: 4 @ $1.25 = $5
  const po2 = await api(srv.base, '/api/purchase-orders', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ supplier: name, lines: [{ rawMaterialId: mat.body.id, qty: 4, unitCost: 1.25 }] }),
  });
  assert.equal(po2.status, 201, JSON.stringify(po2.body));

  const list = await api(srv.base, '/api/suppliers', { headers: auth() });
  const row = (list.body || []).find((s) => s.id === sup.body.id);
  assert.ok(row, 'supplier in list');
  assert.equal(row.stats.totalSpend, 30, `list spend, got ${row.stats?.totalSpend}`);
  assert.equal(row.stats.poCount, 2, 'two POs counted');
  assert.equal(row.stats.openPos, 2, 'both still open');
  assert.ok(row.stats.lastPoAt, 'last order date set');

  // Receive PO #1 → only 1 open remains; spend unchanged
  const rec = await api(srv.base, `/api/purchase-orders/${po1.body.id}/receive`, { method: 'POST', headers: auth() });
  assert.equal(rec.status, 200, JSON.stringify(rec.body));

  const detail = await api(srv.base, `/api/suppliers/${sup.body.id}`, { headers: auth() });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.stats.totalSpend, 30, 'detail spend matches');
  assert.equal(detail.body.stats.openPos, 1, 'one open after receive');
  assert.equal(detail.body.stats.poCount, 2);
  assert.equal(detail.body.purchaseOrders.length, 2, 'detail lists both POs');
  const poWithTotal = detail.body.purchaseOrders.find((p) => p.id === po2.body.id);
  assert.equal(poWithTotal.total, 5, 'PO total computed from lines');

  // Cleanup this test's POs so the after() supplier delete isn't blocked
  // (received POs can't be deleted via API anymore — remove directly)
  await prisma.purchaseOrder.delete({ where: { id: po1.body.id } }).catch(() => {});
  await api(srv.base, `/api/purchase-orders/${po2.body.id}`, { method: 'DELETE', headers: auth() });
});

test('stats fall back to supplier name for POs with no supplierId', async () => {
  const name = `Sup Legacy ${uniq}`;
  const sup = await api(srv.base, '/api/suppliers', {
    method: 'POST', headers: auth(), body: JSON.stringify({ name }),
  });
  assert.equal(sup.status, 201, JSON.stringify(sup.body));
  supIds.push(sup.body.id);

  // Legacy-style PO: create then strip the link so only the text name remains
  const mat = await api(srv.base, '/api/materials', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ sku: `RM-LEG-${uniq}`, name: 'Legacy stat stock', unit: 'sheet' }),
  });
  assert.equal(mat.status, 201, JSON.stringify(mat.body));
  matIds.push(mat.body.id);
  const po = await api(srv.base, '/api/purchase-orders', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ supplier: name, lines: [{ rawMaterialId: mat.body.id, qty: 2, unitCost: 7.5 }] }),
  });
  assert.equal(po.status, 201, JSON.stringify(po.body));
  await prisma.purchaseOrder.update({ where: { id: po.body.id }, data: { supplierId: null } });

  const list = await api(srv.base, '/api/suppliers', { headers: auth() });
  const row = (list.body || []).find((s) => s.id === sup.body.id);
  assert.ok(row, 'supplier in list');
  assert.equal(row.stats.totalSpend, 15, `name-fallback spend, got ${row.stats?.totalSpend}`);
  assert.equal(row.stats.poCount, 1);

  await api(srv.base, `/api/purchase-orders/${po.body.id}`, { method: 'DELETE', headers: auth() });
});

test('unused supplier deletes cleanly; material supplier text auto-links by name', async () => {
  const freeName = `Sup Free ${uniq}`;
  const create = await api(srv.base, '/api/suppliers', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name: freeName }),
  });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  supIds.push(create.body.id);

  const del = await api(srv.base, `/api/suppliers/${create.body.id}`, { method: 'DELETE', headers: auth() });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.equal(del.body.ok, true);

  const autoName = `Sup Auto ${uniq}`;
  const auto = await api(srv.base, '/api/suppliers', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name: autoName }),
  });
  assert.equal(auto.status, 201, JSON.stringify(auto.body));
  supIds.push(auto.body.id);

  const mat = await api(srv.base, '/api/materials', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ sku: `RM-AUTO-${uniq}`, name: 'Auto-linked stock', unit: 'sheet', supplier: autoName }),
  });
  assert.equal(mat.status, 201, JSON.stringify(mat.body));
  matIds.push(mat.body.id);
  assert.equal(mat.body.supplierId, auto.body.id, 'supplier text auto-linked by name');

  const list = await api(srv.base, '/api/suppliers', { headers: auth() });
  const row = (list.body || []).find((s) => s.id === auto.body.id);
  assert.ok(row, 'auto-linked supplier still listed');
  assert.equal(row._count.rawMaterials, 1, 'usage count reflects the link');
});
