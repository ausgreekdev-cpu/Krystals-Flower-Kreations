import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
const bookLimit = rateLimit('workshop_book', 10, 1);

router.post('/sessions/:sessionId/book', bookLimit, asyncHandler(async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).max(120), email: z.string().email().max(254), phone: z.string().max(30).optional(),
    quantity: z.number().int().finite().min(1).max(10).default(1),
    kitAddOn: z.boolean().default(false),
    totalPaid: z.number().finite().nonnegative().max(100000).optional(),
  }).strict();
  const data = schema.parse(req.body);
  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.workshopSession.findUnique({ where: { id: req.params.sessionId }, include: { workshop: true } });
    if (!session) throw Object.assign(new Error('Session not found'), { status: 404, code: 'not_found' });
    const updated = await tx.workshopSession.updateMany({ where: { id: session.id, bookedCount: { lte: session.capacity - data.quantity } }, data: { bookedCount: { increment: data.quantity } } });
    const status = updated.count === 1 ? 'confirmed' : 'waitlisted';
    if (updated.count !== 1) await tx.workshopSession.update({ where: { id: session.id }, data: { waitlistCount: { increment: data.quantity } } });
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
      ticket = await tx.ticket.create({ data: { bookingId: booking.id, qrPayload, qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrPayload)}` } });
    }
    return { booking, ticket, status };
  });
  res.status(201).json({ ...result.booking, ticket: result.ticket });
}));

router.get('/tickets/:qrPayload', asyncHandler(async (req, res) => {
  const qr = String(req.params.qrPayload).slice(0,120);
  const ticket = await prisma.ticket.findUnique({ where: { qrPayload: qr }, include: { booking: { include: { session: { include: { workshop: true } } } } } });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found', code: 'not_found' });
  res.json(ticket);
}));

export default router;
