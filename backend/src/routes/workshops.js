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

// Book a session
router.post('/sessions/:sessionId/book', async (req, res) => {
  const schema = z.object({ name: z.string().min(2), email: z.string().email(), phone: z.string().optional(), quantity: z.number().int().min(1).default(1) });
  const data = schema.parse(req.body);
  const session = await prisma.workshopSession.findUnique({ where: { id: req.params.sessionId } });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const remaining = session.capacity - session.bookedCount;
  const status = data.quantity <= remaining ? 'confirmed' : 'waitlisted';
  const booking = await prisma.booking.create({ data: { sessionId: session.id, name: data.name, email: data.email, phone: data.phone, quantity: data.quantity, status } });
  if (status === 'confirmed') await prisma.workshopSession.update({ where: { id: session.id }, data: { bookedCount: { increment: data.quantity } } });
  else await prisma.workshopSession.update({ where: { id: session.id }, data: { waitlistCount: { increment: data.quantity } } });
  res.status(201).json(booking);
});

export default router;
