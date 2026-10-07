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

test('admin can reset a password; old password stops working', async () => {
  const email = `admmut-rpw-${uniq}@example.com`;
  const create = await api(srv.base, '/api/users', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name: 'Reset Target', email, password: 'secret123', role: 'staff' }),
  });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  userIds.push(create.body.id);

  const oldLogin = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'secret123' }),
  });
  assert.equal(oldLogin.status, 200, JSON.stringify(oldLogin.body));

  const shortPw = await api(srv.base, `/api/users/${create.body.id}/reset-password`, {
    method: 'POST', headers: auth(), body: JSON.stringify({ password: 'abc' }),
  });
  assert.equal(shortPw.status, 400, JSON.stringify(shortPw.body));

  const reset = await api(srv.base, `/api/users/${create.body.id}/reset-password`, {
    method: 'POST', headers: auth(), body: JSON.stringify({ password: 'newpass456' }),
  });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));

  const stale = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'secret123' }),
  });
  assert.equal(stale.status, 401, JSON.stringify(stale.body));

  const fresh = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'newpass456' }),
  });
  assert.equal(fresh.status, 200, JSON.stringify(fresh.body));

  const guestReset = await api(srv.base, `/api/users/${create.body.id}/reset-password`, {
    method: 'POST', headers: { Authorization: `Bearer ${custToken}` }, body: JSON.stringify({ password: 'hacked99' }),
  });
  assert.equal(guestReset.status, 403, JSON.stringify(guestReset.body));

  const selfMe = await prisma.user.findUnique({ where: { email: 'admin@krystal.local' }, select: { id: true } });
  const selfReset = await api(srv.base, `/api/users/${selfMe.id}/reset-password`, {
    method: 'POST', headers: auth(), body: JSON.stringify({ password: 'selfpass1' }),
  });
  assert.equal(selfReset.status, 400, JSON.stringify(selfReset.body));
});

test('admin can delete users; self/rank/POS-history/guest are guarded', async () => {
  // Self-delete is refused
  const me = await prisma.user.findUnique({ where: { email: 'admin@krystal.local' }, select: { id: true } });
  const self = await api(srv.base, `/api/users/${me.id}`, { method: 'DELETE', headers: auth() });
  assert.equal(self.status, 400, JSON.stringify(self.body));

  // Plain user deletes cleanly (orders/loyalty key off email and survive)
  const email = `admmut-del-${uniq}@example.com`;
  const create = await api(srv.base, '/api/users', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name: 'Delete Target', email, password: 'secret123', role: 'staff' }),
  });
  assert.equal(create.status, 201, JSON.stringify(create.body));

  const del = await api(srv.base, `/api/users/${create.body.id}`, { method: 'DELETE', headers: auth() });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  const gone = await prisma.user.findUnique({ where: { id: create.body.id } });
  assert.equal(gone, null, 'user row removed');

  const again = await api(srv.base, `/api/users/${create.body.id}`, { method: 'DELETE', headers: auth() });
  assert.equal(again.status, 404, JSON.stringify(again.body));

  // POS session history blocks deletion with a clear 409
  const posEmail = `admmut-pos-${uniq}@example.com`;
  const posUser = await api(srv.base, '/api/users', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name: 'POS Target', email: posEmail, password: 'secret123', role: 'staff' }),
  });
  assert.equal(posUser.status, 201, JSON.stringify(posUser.body));
  userIds.push(posUser.body.id);
  const posLogin = await api(srv.base, '/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: posEmail, password: 'secret123' }),
  });
  assert.equal(posLogin.status, 200, JSON.stringify(posLogin.body));
  const open = await api(srv.base, '/api/pos/sessions/open', {
    method: 'POST', headers: { Authorization: `Bearer ${posLogin.body.token}` }, body: JSON.stringify({ openingCash: 0 }),
  });
  assert.equal(open.status, 201, JSON.stringify(open.body));

  const blocked = await api(srv.base, `/api/users/${posUser.body.id}`, { method: 'DELETE', headers: auth() });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.match(blocked.body.error, /POS session/);

  // Cleanup so after() can remove the user
  await prisma.posSession.deleteMany({ where: { openedBy: posUser.body.id } });
  const retry = await api(srv.base, `/api/users/${posUser.body.id}`, { method: 'DELETE', headers: auth() });
  assert.equal(retry.status, 200, JSON.stringify(retry.body));

  // Customer token cannot delete anyone
  const victim = await api(srv.base, '/api/users', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name: 'Guest Victim', email: `admmut-gv-${uniq}@example.com`, password: 'secret123', role: 'customer' }),
  });
  assert.equal(victim.status, 201, JSON.stringify(victim.body));
  userIds.push(victim.body.id);
  const guestDel = await api(srv.base, `/api/users/${victim.body.id}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${custToken}` },
  });
  assert.equal(guestDel.status, 403, JSON.stringify(guestDel.body));

  // Developer account cannot be deleted by non-developers; here caller IS a
  // developer, but deleting the seeded developer is still refused (self rank rule
  // is already covered above — instead prove equal-rank admin protection).
  const admEmail = `admmut-adm-${uniq}@example.com`;
  const adm = await api(srv.base, '/api/users', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name: 'Peer Admin', email: admEmail, password: 'secret123', role: 'admin' }),
  });
  assert.equal(adm.status, 201, JSON.stringify(adm.body));
  userIds.push(adm.body.id);
  const admLogin = await api(srv.base, '/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: admEmail, password: 'secret123' }),
  });
  assert.equal(admLogin.status, 200, JSON.stringify(admLogin.body));
  // Admin (rank 3) cannot delete another admin (rank 3) or a developer (rank 4)
  const peerTarget = await api(srv.base, '/api/users', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ name: 'Peer Victim', email: `admmut-pv-${uniq}@example.com`, password: 'secret123', role: 'admin' }),
  });
  assert.equal(peerTarget.status, 201, JSON.stringify(peerTarget.body));
  userIds.push(peerTarget.body.id);
  const peer = await api(srv.base, `/api/users/${peerTarget.body.id}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${admLogin.body.token}` },
  });
  assert.equal(peer.status, 403, JSON.stringify(peer.body));
  const upDev = await api(srv.base, `/api/users/${me.id}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${admLogin.body.token}` },
  });
  assert.equal(upDev.status, 403, JSON.stringify(upDev.body));
  // ...but the developer can remove the admin
  const devDel = await api(srv.base, `/api/users/${adm.body.id}`, { method: 'DELETE', headers: auth() });
  assert.equal(devDel.status, 200, JSON.stringify(devDel.body));
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
