import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api, cleanupTestBookings } from './helpers.js';
import prisma from '../src/lib/prisma.js';

let srv;
let token;
let custToken;
const uniq = Date.now().toString(36);
const auth = () => ({ Authorization: `Bearer ${token}` });
let wsId;
let sessionId;
let firstBooking;

before(async () => {
  srv = await startServer();
  await cleanupTestBookings();
  const login = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  assert.equal(login.status, 200, 'seeded developer login');
  token = login.body.token;
  const reg = await api(srv.base, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Book Adm Cust', email: `book-adm-${uniq}@test.com`, password: 'secret123' }),
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  custToken = reg.body.token;

  const ws = await api(srv.base, '/api/workshops', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ title: `BookingAdm Workshop ${uniq}`, slug: `bookingadm-ws-${uniq}`, price: 50, capacity: 1, location: 'Test Studio' }),
  });
  assert.equal(ws.status, 201, JSON.stringify(ws.body));
  wsId = ws.body.id;
  const session = await api(srv.base, `/api/workshops/${wsId}/sessions`, {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ startsAt: new Date(Date.now() + 7 * 86400e3).toISOString(), endsAt: new Date(Date.now() + 7 * 86400e3 + 7200e3).toISOString(), capacity: 1 }),
  });
  assert.equal(session.status, 201, JSON.stringify(session.body));
  sessionId = session.body.id;
});

after(async () => {
  await cleanupTestBookings();
  if (wsId) await prisma.workshop.deleteMany({ where: { id: wsId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { endsWith: '@test.com' }, role: 'customer' } }).catch(() => {});
  await srv.close();
});

const book = (name) => api(srv.base, `/api/workshops/sessions/${sessionId}/book`, {
  method: 'POST',
  body: JSON.stringify({ name, email: `${name.toLowerCase().replace(/\s+/g, '')}-${uniq}@test.com`, quantity: 1 }),
});

const patch = (id, body, headers = auth()) => api(srv.base, `/api/bookings/${id}`, {
  method: 'PATCH', headers, body: JSON.stringify(body),
});

async function sessionRow() {
  return prisma.workshopSession.findUnique({ where: { id: sessionId } });
}

test('cancel frees the seat; restore re-takes it and keeps the ticket', async () => {
  const created = await book('Seat Holder');
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.status, 'confirmed');
  firstBooking = created.body;
  assert.ok(firstBooking.ticket?.qrPayload, 'confirmed booking has a ticket');
  let s = await sessionRow();
  assert.equal(s.bookedCount, 1, 'seat held after booking');

  const cancel = await patch(firstBooking.id, { status: 'cancelled' });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  assert.equal(cancel.body.status, 'cancelled');
  s = await sessionRow();
  assert.equal(s.bookedCount, 0, 'seat freed on cancel');

  const restore = await patch(firstBooking.id, { status: 'confirmed' });
  assert.equal(restore.status, 200, JSON.stringify(restore.body));
  assert.equal(restore.body.status, 'confirmed');
  s = await sessionRow();
  assert.equal(s.bookedCount, 1, 'seat re-taken on restore');
  assert.equal(restore.body.ticket?.qrPayload, firstBooking.ticket.qrPayload, 'same ticket after restore');
});

test('check-in is blocked for cancelled bookings', async () => {
  const cancel = await patch(firstBooking.id, { status: 'cancelled' });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));

  const checkin = await api(srv.base, '/api/tickets/check-in', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ qrPayload: firstBooking.ticket.qrPayload }),
  });
  assert.equal(checkin.status, 409, JSON.stringify(checkin.body));
  assert.equal(checkin.body.code, 'booking_cancelled');

  const still = await prisma.booking.findUnique({ where: { id: firstBooking.id } });
  assert.equal(still.status, 'cancelled', 'check-in did not flip the booking');
});

test('invalid transitions and bad actors are rejected', async () => {
  const restore = await patch(firstBooking.id, { status: 'confirmed' });
  assert.equal(restore.status, 200, JSON.stringify(restore.body));

  const attend = await patch(firstBooking.id, { status: 'attended' });
  assert.equal(attend.status, 200, JSON.stringify(attend.body));
  assert.ok(attend.body.checkedInAt, 'attended sets checkedInAt');

  // attended → confirmed is not a thing (restore only from cancelled/waitlisted/pending)
  const bad = await patch(firstBooking.id, { status: 'confirmed' });
  assert.equal(bad.status, 409, JSON.stringify(bad.body));
  assert.equal(bad.body.code, 'invalid_transition');

  const customer = await patch(firstBooking.id, { status: 'cancelled' }, { Authorization: `Bearer ${custToken}` });
  assert.equal(customer.status, 403, JSON.stringify(customer.body));

  const guest = await patch(firstBooking.id, { status: 'cancelled' }, {});
  assert.ok([401, 403].includes(guest.status), `expected auth failure, got ${guest.status}`);
});

test('marking no-show clears check-in; attended ↔ no_show are corrections', async () => {
  const noShow = await patch(firstBooking.id, { status: 'no_show' });
  assert.equal(noShow.status, 200, JSON.stringify(noShow.body));
  assert.equal(noShow.body.status, 'no_show');
  assert.equal(noShow.body.checkedInAt, null, 'no-show clears checkedInAt');
  assert.equal(noShow.body.ticket?.checkedInAt, null, 'ticket check-in cleared too');

  const back = await patch(firstBooking.id, { status: 'attended' });
  assert.equal(back.status, 200, JSON.stringify(back.body));
  assert.equal(back.body.status, 'attended');
  assert.ok(back.body.checkedInAt, 'correction back to attended re-stamps');
});

test('refund marks refundedAt once; $0 bookings cannot be refunded', async () => {
  const r1 = await patch(firstBooking.id, { refund: true });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.ok(r1.body.refundedAt, 'refundedAt stamped');

  const r2 = await patch(firstBooking.id, { refund: true });
  assert.equal(r2.status, 409, JSON.stringify(r2.body));
  assert.equal(r2.body.code, 'already_refunded');

  // Session is full (firstBooking holds the only seat) → next booking waitlists
  const wl = await book('Wait Lister');
  assert.equal(wl.status, 201, JSON.stringify(wl.body));
  assert.equal(wl.body.status, 'waitlisted', 'session is full → waitlist');
  assert.equal(Number(wl.body.totalPaid), 0, 'waitlisted pays nothing');

  const r0 = await patch(wl.body.id, { refund: true });
  assert.equal(r0.status, 409, JSON.stringify(r0.body));
  assert.equal(r0.body.code, 'nothing_to_refund');

  // Free the seat so the promotion test below has somewhere to sit
  const cancel = await patch(firstBooking.id, { status: 'cancelled' });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
});

test('promoting from the waitlist takes the freed seat and mints a ticket', async () => {
  const wl = await prisma.booking.findFirst({ where: { sessionId, status: 'waitlisted' } });
  assert.ok(wl, 'waitlisted booking exists from previous test');
  let s = await sessionRow();
  assert.equal(s.waitlistCount, 1, 'waitlist slot held');

  const promote = await patch(wl.id, { status: 'confirmed' });
  assert.equal(promote.status, 200, JSON.stringify(promote.body));
  assert.equal(promote.body.status, 'confirmed');
  assert.ok(promote.body.ticket?.qrPayload, 'promotion mints a ticket');
  s = await sessionRow();
  assert.equal(s.bookedCount, 1, 'seat taken');
  assert.equal(s.waitlistCount, 0, 'waitlist slot released');
});

test('booking notes can be edited without a status change', async () => {
  const wl = await prisma.booking.findFirst({ where: { sessionId, status: 'waitlisted' } });
  if (wl) {
    const res = await patch(wl.id, { notes: 'Prefers window seat' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.notes, 'Prefers window seat');
  } else {
    // Fall back to the confirmed booking
    const res = await patch(firstBooking.id, { notes: 'Prefers window seat' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.notes, 'Prefers window seat');
  }
});

test('PATCH on unknown booking → 404', async () => {
  const res = await patch('no-such-booking-id', { status: 'cancelled' });
  assert.equal(res.status, 404, JSON.stringify(res.body));
});
