import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const requireAuth = authenticate;
const bookLimit = rateLimit('workshop_book', 10, 1);

router.get('/', async (req, res) => {
  const workshops = await prisma.workshop.findMany({ where: { isActive: true }, include: { sessions: { orderBy: { startsAt: 'asc' } } }, orderBy: { createdAt: 'desc' } });
  res.json(workshops);
});

router.get('/:slug', async (req, res) => {
  const w = await prisma.workshop.findUnique({ where: { slug: req.params.slug }, include: { sessions: { include: { bookings: true } } } });
  if (!w) return res.status(404).json({ error: 'Not found' });
  res.json(w);
});

const workshopSchema = z.object({
  title: z.string().min(3), slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().optional().nullable(),
  price: z.number().nonnegative(), capacity: z.number().int().min(1).default(12),
  location: z.string().optional().nullable(), durationMinutes: z.number().int().optional().nullable(),
});

router.post('/', requireAuth, requireRole('admin','developer','maker'), async (req, res) => {
  const data = workshopSchema.parse(req.body);
  const w = await prisma.workshop.create({ data });
  res.status(201).json(w);
});

router.post('/:id/sessions', requireAuth, requireRole('admin','developer','maker'), async (req, res) => {
  const schema = z.object({ startsAt: z.string(), endsAt: z.string(), capacity: z.number().int().optional() });
  const data = schema.parse(req.body);
  const session = await prisma.workshopSession.create({ data: { workshopId: req.params.id, startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt), capacity: data.capacity || 12 } });
  res.status(201).json(session);
});

// Book a session — atomic capacity check + QR ticket generation
router.post('/sessions/:sessionId/book', bookLimit, asyncHandler(async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).max(120), email: z.string().email().max(254), phone: z.string().max(30).optional(),
    quantity: z.number().int().finite().min(1).max(10).default(1),
    kitAddOn: z.boolean().default(false),
    totalPaid: z.number().finite().nonnegative().max(100000).optional(),
  });
  const data = schema.parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.workshopSession.findUnique({ where: { id: req.params.sessionId }, include: { workshop: true } });
    if (!session) throw Object.assign(new Error('Session not found'), { status: 404, code: 'not_found' });
    // Atomic try to reserve seats
    const updated = await tx.workshopSession.updateMany({
      where: { id: session.id, bookedCount: { lte: session.capacity - data.quantity } },
      data: { bookedCount: { increment: data.quantity } }
    });
    const status = updated.count === 1 ? 'confirmed' : 'waitlisted';
    if (updated.count !== 1) {
      // Waitlist: increment waitlistCount
      await tx.workshopSession.update({ where: { id: session.id }, data: { waitlistCount: { increment: data.quantity } } });
    }
    const booking = await tx.booking.create({
      data: {
        sessionId: session.id, name: data.name, email: data.email, phone: data.phone,
        quantity: data.quantity, status, totalPaid: data.totalPaid ?? (status === 'confirmed' ? Number(session.workshop.price) * data.quantity + (data.kitAddOn ? 25 : 0) : 0),
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
    return { booking, ticket, status };
  });
  res.status(201).json({ ...result.booking, ticket: result.ticket });
}));

// Ticket lookup for workshop check-in at POS
router.get('/tickets/:qrPayload', async (req, res) => {
  const ticket = await prisma.ticket.findUnique({ where: { qrPayload: req.params.qrPayload }, include: { booking: { include: { session: { include: { workshop: true } } } } } });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

export default router;
