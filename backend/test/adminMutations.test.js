import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';

let srv;
let token;
let custToken;
const uniq = Date.now().toString(36);
const auth = () => ({ Authorization: `Bearer ${token}` });
const userIds = [];

before(async () => {
  srv = await startServer();
  const login = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  assert.equal(login.status, 200, 'seeded developer login');
  token = login.body.token;
  const reg = await api(srv.base, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Adm Mut Cust', email: `adm-mut-${uniq}@example.com`, password: 'secret123' }),
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  custToken = reg.body.token;
});

after(async () => {
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
  await prisma.workshop.deleteMany({ where: { title: { startsWith: `AdmMut ${uniq}` } } }).catch(() => {});
  await prisma.supplier.deleteMany({ where: { name: { startsWith: `PO Sup ${uniq}` } } }).catch(() => {});
  await srv.close();
});

// ── workshops ────────────────────────────────────────────────────────────────

test('workshop create → edit → slug conflict → delete', async () => {
  const create = await api(srv.base, '/api/workshops', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ title: `AdmMut Workshop ${uniq}`, slug: `admmut-ws-${uniq}`, price: 55, capacity: 8, location: 'Test Studio', description: 'temp' }),
  });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  const id = create.body.id;

  const patch = await api(srv.base, `/api/workshops/${id}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ price: 75, level: 'intermediate', isActive: false }),
  });
  assert.equal(patch.status, 200, JSON.stringify(patch.body));
  assert.equal(Number(patch.body.price), 75);
  assert.equal(patch.body.level, 'intermediate');
  assert.equal(patch.body.isActive, false);

  const dup = await api(srv.base, `/api/workshops/${id}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ slug: 'cricut-blooms-101' }),
  });
  assert.equal(dup.status, 409, JSON.stringify(dup.body));

  const guestEdit = await api(srv.base, `/api/workshops/${id}`, { method: 'PATCH', body: JSON.stringify({ price: 1 }) });
  assert.ok([401, 403].includes(guestEdit.status), `expected auth failure, got ${guestEdit.status}`);

  const del = await api(srv.base, `/api/workshops/${id}`, { method: 'DELETE', headers: auth() });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.equal(del.body.ok, true);

  const gone = await api(srv.base, `/api/workshops/${id}`, { method: 'DELETE', headers: auth() });
  assert.equal(gone.status, 404);
});

test('workshop delete blocked while bookings exist; session edit guards capacity', async () => {
  const w = await api(srv.base, '/api/workshops', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ title: `AdmMut Booked ${uniq}`, slug: `admmut-bk-${uniq}`, price: 40, capacity: 6 }),
  });
  assert.equal(w.status, 201, JSON.stringify(w.body));
  const startsAt = new Date(Date.now() + 30 * 86400e3).toISOString();
  const endsAt = new Date(Date.now() + 30 * 86400e3 + 3 * 3600e3).toISOString();
  const s = await api(srv.base, `/api/workshops/${w.body.id}/sessions`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ startsAt, endsAt, capacity: 4 }),
  });
  assert.equal(s.status, 201, JSON.stringify(s.body));

  await prisma.booking.create({ data: { sessionId: s.body.id, name: 'Bk Tester', email: `bk-${uniq}@example.com`, quantity: 2, status: 'confirmed' } });
  await prisma.workshopSession.update({ where: { id: s.body.id }, data: { bookedCount: 2 } });

  const delBlocked = await api(srv.base, `/api/workshops/${w.body.id}`, { method: 'DELETE', headers: auth() });
  assert.equal(delBlocked.status, 409, JSON.stringify(delBlocked.body));
  assert.match(delBlocked.body.error, /booking/i);

  const sessBlocked = await api(srv.base, `/api/workshops/sessions/${s.body.id}`, { method: 'DELETE', headers: auth() });
  assert.equal(sessBlocked.status, 409, JSON.stringify(sessBlocked.body));

  const capBlocked = await api(srv.base, `/api/workshops/sessions/${s.body.id}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ capacity: 1 }),
  });
  assert.equal(capBlocked.status, 409, JSON.stringify(capBlocked.body));

  const sessOk = await api(srv.base, `/api/workshops/sessions/${s.body.id}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ capacity: 3 }),
  });
  assert.equal(sessOk.status, 200, JSON.stringify(sessOk.body));
  assert.equal(sessOk.body.capacity, 3);

  await prisma.booking.deleteMany({ where: { sessionId: s.body.id } });
});

// ── purchase orders ──────────────────────────────────────────────────────────

test('PO edit replaces lines and blocks once received; supplier auto-links', async () => {
  const mat = await api(srv.base, '/api/materials', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ sku: `RM-PO-${uniq}`, name: 'PO edit stock', unit: 'sheet', onHand: 0 }),
  });
  assert.equal(mat.status, 201, JSON.stringify(mat.body));

  const supName = `PO Sup ${uniq}`;
  const sup = await api(srv.base, '/api/suppliers', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name: supName }),
  });
  assert.equal(sup.status, 201, JSON.stringify(sup.body));
  const create = await api(srv.base, '/api/purchase-orders', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ supplier: supName, notes: 'first', lines: [{ rawMaterialId: mat.body.id, qty: 5, unitCost: 0.5 }] }),
  });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  const id = create.body.id;
  assert.equal(create.body.supplierId, sup.body.id, 'PO auto-links supplier by name');
  assert.equal(create.body.lines.length, 1);

  const patch = await api(srv.base, `/api/purchase-orders/${id}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ notes: 'second', lines: [{ rawMaterialId: mat.body.id, qty: 9, unitCost: 0.4 }, { rawMaterialId: mat.body.id, qty: 2, unitCost: null }] }),
  });
  assert.equal(patch.status, 200, JSON.stringify(patch.body));
  assert.equal(patch.body.notes, 'second');
  assert.equal(patch.body.lines.length, 2, 'old line replaced');

  const rec = await api(srv.base, `/api/purchase-orders/${id}/receive`, { method: 'POST', headers: auth() });
  assert.equal(rec.status, 200, JSON.stringify(rec.body));

  const lateEdit = await api(srv.base, `/api/purchase-orders/${id}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ notes: 'too late' }),
  });
  assert.equal(lateEdit.status, 409, JSON.stringify(lateEdit.body));

  const lateDelete = await api(srv.base, `/api/purchase-orders/${id}`, { method: 'DELETE', headers: auth() });
  assert.equal(lateDelete.status, 409, JSON.stringify(lateDelete.body));
  const stillThere = await api(srv.base, `/api/purchase-orders/${id}`, { headers: auth() });
  assert.equal(stillThere.status, 200, 'received PO survives delete attempt');

  await prisma.purchaseOrder.delete({ where: { id } }).catch(() => {});
  await api(srv.base, `/api/materials/${mat.body.id}`, { method: 'DELETE', headers: auth() });
});

// ── users ────────────────────────────────────────────────────────────────────

test('admin can create and edit users; customer tokens cannot', async () => {
  const email = `admmut-new-${uniq}@example.com`;
  const create = await api(srv.base, '/api/users', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name: 'Adm Mut New', email, password: 'secret123', role: 'staff', phone: '0400111222' }),
  });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  userIds.push(create.body.id);
  assert.equal(create.body.role, 'staff');
  assert.equal(create.body.phone, '0400111222');

  const dup = await api(srv.base, '/api/users', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name: 'Dup', email: email.toUpperCase(), password: 'secret123', role: 'customer' }),
  });
  assert.equal(dup.status, 409, JSON.stringify(dup.body));

  const badRole = await api(srv.base, '/api/users', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name: 'Evil', email: `evil-${uniq}@example.com`, password: 'secret123', role: 'developer' }),
  });
  assert.equal(badRole.status, 400, JSON.stringify(badRole.body));

  const patch = await api(srv.base, `/api/users/${create.body.id}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ name: 'Adm Mut Renamed', phone: null }),
  });
  assert.equal(patch.status, 200, JSON.stringify(patch.body));
  assert.equal(patch.body.name, 'Adm Mut Renamed');
  assert.equal(patch.body.phone, null);
  assert.equal(patch.body.role, 'staff', 'profile patch does not change role');

  const guestCreate = await api(srv.base, '/api/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${custToken}` },
    body: JSON.stringify({ name: 'Nope', email: `nope-${uniq}@example.com`, password: 'secret123', role: 'admin' }),
  });
  assert.equal(guestCreate.status, 403, JSON.stringify(guestCreate.body));
});

// ── locations ────────────────────────────────────────────────────────────────

test('inventory location create → edit → delete', async () => {
  const create = await api(srv.base, '/api/inventory/locations', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name: `AdmMut Loc ${uniq}`, address: '9 Test Ave' }),
  });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  const id = create.body.id;

  const patch = await api(srv.base, `/api/inventory/locations/${id}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ address: '10 Test Ave' }),
  });
  assert.equal(patch.status, 200, JSON.stringify(patch.body));
  assert.equal(patch.body.address, '10 Test Ave');

  const del = await api(srv.base, `/api/inventory/locations/${id}`, { method: 'DELETE', headers: auth() });
  assert.equal(del.status, 200, JSON.stringify(del.body));
});
