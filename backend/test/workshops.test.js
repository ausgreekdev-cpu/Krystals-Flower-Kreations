import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';

let srv;
let adminToken;
let custToken;
const uniq = Date.now().toString(36);
before(async () => {
  srv = await startServer();
  const login = await api(srv.base, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }) });
  assert.equal(login.status, 200, 'seeded developer login');
  adminToken = login.body.token;
  const reg = await api(srv.base, '/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Ws Vis Cust', email: `ws-vis-${uniq}@example.com`, password: 'secret123' }) });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  custToken = reg.body.token;
});
after(async () => {
  await prisma.workshop.deleteMany({ where: { title: { startsWith: `Ws Vis ${uniq}` } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: `ws-vis-${uniq}@example.com` } }).catch(() => {});
  await srv.close();
});

test('GET /api/workshops lists the two seeded workshops', async () => {
  const { status, body } = await api(srv.base, '/api/workshops');
  assert.equal(status, 200);
  const arr = Array.isArray(body) ? body : body.workshops;
  assert.ok(Array.isArray(arr));
  assert.ok(arr.length >= 2);
  assert.ok(arr.some((w) => w.slug === 'cricut-blooms-101'));
  assert.ok(arr.some((w) => w.slug === 'origami-bouquet-masterclass'));
});

test('workshops carry future sessions', async () => {
  const { body } = await api(srv.base, '/api/workshops');
  const arr = Array.isArray(body) ? body : body.workshops;
  const withSessions = arr.find((w) => (w.sessions || []).length > 0);
  assert.ok(withSessions, 'at least one workshop has sessions');
  const session = withSessions.sessions[0];
  assert.ok(new Date(session.startsAt).getTime() > Date.now(), 'session is in the future');
  assert.ok(session.capacity > 0);
});

test('hidden workshops: ?all=1 is staff-only, public list excludes them, hidden sessions not bookable', async () => {
  const auth = { Authorization: `Bearer ${adminToken}` };
  const create = await api(srv.base, '/api/workshops', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ title: `Ws Vis Workshop ${uniq}`, slug: `ws-vis-${uniq}`, price: 50, capacity: 6, location: 'Test Studio', description: 'visibility test' }),
  });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  const id = create.body.id;

  // Staff list includes it while active
  const beforeHide = await api(srv.base, '/api/workshops?all=1', { headers: auth });
  assert.equal(beforeHide.status, 200);
  assert.ok(beforeHide.body.some((w) => w.id === id), 'active workshop in staff list');

  // Hide it
  const patch = await api(srv.base, `/api/workshops/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ isActive: false }) });
  assert.equal(patch.status, 200, JSON.stringify(patch.body));
  assert.equal(patch.body.isActive, false);

  // Public list (no flag, no token) excludes it — the old bug made it vanish everywhere
  const pub = await api(srv.base, '/api/workshops');
  assert.equal(pub.status, 200);
  assert.ok(!pub.body.some((w) => w.id === id), 'hidden workshop not in public list');

  // Staff list still shows it
  const staff = await api(srv.base, '/api/workshops?all=1', { headers: auth });
  assert.equal(staff.status, 200);
  const found = staff.body.find((w) => w.id === id);
  assert.ok(found, 'hidden workshop still in staff list');
  assert.equal(found.isActive, false);

  // ?all=1 without a token → 401/403; with a customer token → 403
  const guest = await api(srv.base, '/api/workshops?all=1');
  assert.ok([401, 403].includes(guest.status), `guest ?all=1 → ${guest.status}`);
  const customer = await api(srv.base, '/api/workshops?all=1', { headers: { Authorization: `Bearer ${custToken}` } });
  assert.equal(customer.status, 403, JSON.stringify(customer.body));

  // Hidden workshop's session is not bookable
  const startsAt = new Date(Date.now() + 7 * 864e5).toISOString();
  const sess = await api(srv.base, `/api/workshops/${id}/sessions`, { method: 'POST', headers: auth, body: JSON.stringify({ startsAt, endsAt: new Date(new Date(startsAt).getTime() + 2 * 36e5).toISOString(), capacity: 6 }) });
  assert.equal(sess.status, 201, JSON.stringify(sess.body));
  const book = await api(srv.base, `/api/workshops/sessions/${sess.body.id}/book`, { method: 'POST', body: JSON.stringify({ name: 'Sneaky Booker', email: 'sneaky@example.com', quantity: 1 }) });
  assert.equal(book.status, 404, `booking hidden workshop session → ${book.status} ${JSON.stringify(book.body)}`);

  // Reactivate → bookable again
  const unhide = await api(srv.base, `/api/workshops/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ isActive: true }) });
  assert.equal(unhide.status, 200);
  const book2 = await api(srv.base, `/api/workshops/sessions/${sess.body.id}/book`, { method: 'POST', body: JSON.stringify({ name: 'Ok Booker', email: 'okbooker@example.com', quantity: 1 }) });
  assert.ok([200, 201].includes(book2.status), `booking active workshop session → ${book2.status} ${JSON.stringify(book2.body)}`);

  // after() prunes by title prefix — workshop → session → booking all cascade
});