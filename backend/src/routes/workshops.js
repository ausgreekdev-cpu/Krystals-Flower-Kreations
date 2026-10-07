import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { sendWorkshopConfirmation } from '../services/email.js';
import { getSettings } from '../lib/settingsSchema.js';

const router = Router();
const requireAuth = authenticate;
const bookLimit = rateLimit('workshop_book', 10, 1);

router.get('/', asyncHandler(async (req, res) => {
  const all = req.query.all === '1' || req.query.all === 'true';
  if (all) {
    let authed = false;
    try { await new Promise((resolve, reject) => requireAuth(req, res, (err) => err ? reject(err) : resolve())); if (req.user && ['admin','developer','maker','staff'].includes(req.user.role)) authed = true; } catch {}
    if (!authed) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  }
  const workshops = await prisma.workshop.findMany({ where: all ? {} : { isActive: true }, include: { sessions: { orderBy: { startsAt: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json(workshops);
}));

router.get('/:slug', asyncHandler(async (req, res) => {
  const slug = String(req.params.slug).slice(0,100);
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Invalid slug', code: 'validation_failed' });
  const w = await prisma.workshop.findUnique({ where: { slug }, include: { sessions: { orderBy: { startsAt: 'asc' } } } });
  if (!w) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  res.json(w);
}));

const workshopSchema = z.object({
  title: z.string().min(3), slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().optional().nullable(),
  price: z.number().nonnegative(), capacity: z.number().int().min(1).default(12),
  location: z.string().optional().nullable(), durationMinutes: z.number().int().optional().nullable(),
});

// Edit — partial of the create shape plus admin-only fields (status/level/isActive)
const workshopPatchSchema = z.object({
  title: z.string().min(3).optional(), slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(5000).optional().nullable(),
  price: z.number().nonnegative().optional(), capacity: z.number().int().min(1).optional(),
  location: z.string().max(200).optional().nullable(), durationMinutes: z.number().int().positive().optional().nullable(),
  level: z.string().max(40).optional().nullable(),
  status: z.enum(['draft', 'open', 'full', 'cancelled', 'completed']).optional(),
  isActive: z.boolean().optional(),
}).strict();

router.patch('/:id', requireAuth, requireRole('admin','developer','maker'), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const existing = await prisma.workshop.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  try {
    const w = await prisma.workshop.update({ where: { id }, data: workshopPatchSchema.parse(req.body) });
    res.json(w);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'A workshop with this slug already exists', code: 'conflict' });
    throw e;
  }
}));

// Delete — blocked while real bookings exist (sessions/booking cascade otherwise)
router.delete('/:id', requireAuth, requireRole('admin','developer','maker'), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const w = await prisma.workshop.findUnique({ where: { id }, include: { _count: { select: { sessions: true } } } });
  if (!w) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const bookings = await prisma.booking.count({ where: { session: { workshopId: id }, status: { not: 'cancelled' } } });
  if (bookings > 0) return res.status(409).json({ error: `${bookings} active booking(s) exist — deactivate the workshop instead of deleting`, code: 'conflict' });
  await prisma.workshop.delete({ where: { id } });
  res.json({ ok: true });
}));

const sessionPatchSchema = z.object({
  startsAt: z.string().min(10).max(50).optional(),
  endsAt: z.string().min(10).max(50).optional(),
  capacity: z.number().int().finite().min(1).max(500).optional(),
  status: z.enum(['draft', 'open', 'full', 'cancelled', 'completed']).optional(),
  notes: z.string().max(2000).optional().nullable(),
}).strict();

// Session edit — capacity cannot drop below confirmed bookings
router.patch('/sessions/:sessionId', requireAuth, requireRole('admin','developer','maker'), asyncHandler(async (req, res) => {
  const id = String(req.params.sessionId).slice(0, 100);
  const session = await prisma.workshopSession.findUnique({ where: { id } });
  if (!session) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const data = sessionPatchSchema.parse(req.body);
  if (data.capacity !== undefined && data.capacity < session.bookedCount) {
    return res.status(409).json({ error: `Capacity cannot be below ${session.bookedCount} confirmed booking(s)`, code: 'conflict' });
  }
  const updated = await prisma.workshopSession.update({
    where: { id },
    data: {
      ...(data.startsAt !== undefined ? { startsAt: new Date(data.startsAt) } : {}),
      ...(data.endsAt !== undefined ? { endsAt: new Date(data.endsAt) } : {}),
      ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
    },
  });
  res.json(updated);
}));

// Session delete — blocked while bookings (any status) exist, they cascade
router.delete('/sessions/:sessionId', requireAuth, requireRole('admin','developer','maker'), asyncHandler(async (req, res) => {
  const id = String(req.params.sessionId).slice(0, 100);
  const session = await prisma.workshopSession.findUnique({ where: { id }, include: { _count: { select: { bookings: true } } } });
  if (!session) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  if (session._count.bookings > 0) return res.status(409).json({ error: `${session._count.bookings} booking(s) exist for this session — cancel them first`, code: 'conflict' });
  await prisma.workshopSession.delete({ where: { id } });
  res.json({ ok: true });
}));

router.post('/', requireAuth, requireRole('admin','developer','maker'), asyncHandler(async (req, res) => {
  const data = workshopSchema.parse(req.body);
  const w = await prisma.workshop.create({ data });
  res.status(201).json(w);
}));

router.post('/:id/sessions', requireAuth, requireRole('admin','developer','maker'), asyncHandler(async (req, res) => {
  const schema = z.object({ startsAt: z.string(), endsAt: z.string(), capacity: z.number().int().optional() });
  const data = schema.parse(req.body);
  const session = await prisma.workshopSession.create({ data: { workshopId: req.params.id, startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt), capacity: data.capacity || 12 } });
  res.status(201).json(session);
}));

// Book a session — atomic capacity check + QR ticket generation
router.post('/sessions/:sessionId/book', bookLimit, asyncHandler(async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).max(120), email: z.string().email().max(254), phone: z.string().max(30).optional(),
    quantity: z.number().int().finite().min(1).max(10).default(1),
    kitAddOn: z.boolean().default(false),
  });
  const data = schema.parse(req.body);
  // Booking rules from settings (read before the tx): lead time, open/closed, waitlist.
  const s = await getSettings({ onlyPublic: true });
  const minLeadHours = Number(s.workshop_min_lead_hours) || 0;
  if (s.workshop_bookings_enabled === '0') {
    throw Object.assign(new Error('New bookings are currently closed'), { status: 409, code: 'bookings_closed' });
  }
  const waitlistEnabled = s.workshop_waitlist_enabled !== '0';
  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.workshopSession.findUnique({ where: { id: req.params.sessionId }, include: { workshop: true } });
    if (!session) throw Object.assign(new Error('Session not found'), { status: 404, code: 'not_found' });
    // Hidden workshops aren't bookable (existing bookings stay intact)
    if (session.workshop.isActive === false) throw Object.assign(new Error('Session not found'), { status: 404, code: 'not_found' });
    if (minLeadHours > 0 && new Date(session.startsAt).getTime() < Date.now() + minLeadHours * 3600e3) {
      throw Object.assign(new Error(`Bookings close ${minLeadHours}h before a session starts`), { status: 409, code: 'booking_too_late' });
    }
    // Atomic try to reserve seats
    const updated = await tx.workshopSession.updateMany({
      where: { id: session.id, bookedCount: { lte: session.capacity - data.quantity } },
      data: { bookedCount: { increment: data.quantity } }
    });
    const status = updated.count === 1 ? 'confirmed' : 'waitlisted';
    if (updated.count !== 1) {
      if (!waitlistEnabled) {
        throw Object.assign(new Error('This session is full'), { status: 409, code: 'session_full' });
      }
      // Waitlist: increment waitlistCount
      await tx.workshopSession.update({ where: { id: session.id }, data: { waitlistCount: { increment: data.quantity } } });
    }
    const booking = await tx.booking.create({
      data: {
        sessionId: session.id, name: data.name, email: data.email.trim().toLowerCase(), phone: data.phone,
        quantity: data.quantity, status, // Amount is always computed server-side (never trusted from the client)
        totalPaid: status === 'confirmed' ? Number(session.workshop.price) * data.quantity + (data.kitAddOn ? 25 : 0) : 0,
        notes: data.kitAddOn ? 'Kit add-on' : null,
      },
    });
    let ticket = null;
    if (status === 'confirmed') {
      const qrPayload = `KFK-T-WS-${booking.id.slice(-6).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
      ticket = await tx.ticket.create({
        data: { bookingId: booking.id, qrPayload, qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrPayload)}` },
      });
    }
    return { booking, ticket, status, workshop: session.workshop, session };
  });
  if (result.status === 'confirmed') {
    await sendWorkshopConfirmation({ ...result.booking, ticket: result.ticket }, result.workshop, result.session).catch(()=>{});
  }
  res.status(201).json({ ...result.booking, ticket: result.ticket });
}));

// Ticket lookup for workshop check-in at POS
router.get('/tickets/:qrPayload', asyncHandler(async (req, res) => {
  const ticket = await prisma.ticket.findUnique({ where: { qrPayload: req.params.qrPayload }, include: { booking: { select: { id: true, name: true, quantity: true, status: true, session: { include: { workshop: { select: { id: true, title: true, location: true } } } } } } } });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
}));

export default router;
