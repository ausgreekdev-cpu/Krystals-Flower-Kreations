import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';

const router = Router();

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

// Book a session — with add-on kit + QR ticket generation
router.post('/sessions/:sessionId/book', async (req, res) => {
  const schema = z.object({
    name: z.string().min(2), email: z.string().email(), phone: z.string().optional(),
    quantity: z.number().int().min(1).default(1),
    kitAddOn: z.boolean().default(false),
    totalPaid: z.number().nonnegative().optional(),
  });
  const data = schema.parse(req.body);
  const session = await prisma.workshopSession.findUnique({ where: { id: req.params.sessionId }, include: { workshop: true } });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const remaining = session.capacity - session.bookedCount;
  const status = data.quantity <= remaining ? 'confirmed' : 'waitlisted';
  const booking = await prisma.booking.create({
    data: {
      sessionId: session.id, name: data.name, email: data.email, phone: data.phone,
      quantity: data.quantity, status, totalPaid: data.totalPaid ?? (status === 'confirmed' ? Number(session.workshop.price) * data.quantity + (data.kitAddOn ? 25 : 0) : 0),
      notes: data.kitAddOn ? 'Kit add-on' : null,
    },
  });
  if (status === 'confirmed') await prisma.workshopSession.update({ where: { id: session.id }, data: { bookedCount: { increment: data.quantity } } });
  else await prisma.workshopSession.update({ where: { id: session.id }, data: { waitlistCount: { increment: data.quantity } } });

  // Generate QR ticket for confirmed bookings (Tap-to-Pay / check-in at POS)
  let ticket = null;
  if (status === 'confirmed') {
    const qrPayload = `KFK-T-WS-${booking.id.slice(-6).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    ticket = await prisma.ticket.create({
      data: { bookingId: booking.id, qrPayload, qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrPayload)}` },
    });
  }
  res.status(201).json({ ...booking, ticket });
});

// Ticket lookup for workshop check-in at POS
router.get('/tickets/:qrPayload', async (req, res) => {
  const ticket = await prisma.ticket.findUnique({ where: { qrPayload: req.params.qrPayload }, include: { booking: { include: { session: { include: { workshop: true } } } } } });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

export default router;
