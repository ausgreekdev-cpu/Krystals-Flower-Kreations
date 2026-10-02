import app from '../src/app.js';
import prisma from '../src/lib/prisma.js';

// Boot the Express app on an ephemeral port for integration tests.
// Requires DATABASE_URL to be set (points at the local Postgres in dev, or a
// test database in CI).
export async function startServer() {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

export async function api(base, path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// Workshop bookings created by tests used to accumulate forever: bookedCount
// crept up until every session was full and capacity assertions failed on
// repeat runs. Booking-creating suites call this in before() (heals state left
// by a crashed run) and after() (leaves the DB clean).
export async function cleanupTestBookings() {
  const testEmails = { endsWith: '@test.com' };
  const stale = await prisma.booking.findMany({ where: { email: testEmails }, select: { id: true } });
  if (stale.length) {
    const ids = stale.map((b) => b.id);
    await prisma.ticket.deleteMany({ where: { bookingId: { in: ids } } });
    await prisma.booking.deleteMany({ where: { id: { in: ids } } });
  }
  // Recompute counters from whatever bookings remain (seed creates none).
  const sessions = await prisma.workshopSession.findMany({ include: { bookings: { select: { status: true, quantity: true } } } });
  for (const s of sessions) {
    const confirmed = s.bookings.filter((b) => b.status === 'confirmed').reduce((a, b) => a + b.quantity, 0);
    const waitlisted = s.bookings.filter((b) => b.status === 'waitlisted').reduce((a, b) => a + b.quantity, 0);
    if (confirmed !== s.bookedCount || waitlisted !== s.waitlistCount) {
      await prisma.workshopSession.update({ where: { id: s.id }, data: { bookedCount: confirmed, waitlistCount: waitlisted } });
    }
  }
}