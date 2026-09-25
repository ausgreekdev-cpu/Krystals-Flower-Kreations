import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();

// Admin: list bookings, optionally filtered by session or status
router.get('/', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const sessionId = req.query.sessionId ? String(req.query.sessionId).slice(0,100) : undefined;
  const status = req.query.status ? String(req.query.status).slice(0,20) : undefined;
  const where = {};
  if (sessionId) where.sessionId = sessionId;
  if (status) where.status = status;
  const bookings = await prisma.booking.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { session: { include: { workshop: { select: { id: true, title: true } } } }, ticket: true },
  });
  res.json(bookings);
}));

// Note: workshop booking is handled by /api/workshops/sessions/:id/book (the
// canonical route, which also emails the confirmation). This router only exposes
// the staff booking list + public ticket lookup.

router.get('/tickets/:qrPayload', asyncHandler(async (req, res) => {
  const qr = String(req.params.qrPayload).slice(0,120);
  const ticket = await prisma.ticket.findUnique({ where: { qrPayload: qr }, include: { booking: { select: { id: true, name: true, quantity: true, status: true, session: { include: { workshop: { select: { id: true, title: true, location: true } } } } } } } });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found', code: 'not_found' });
  res.json(ticket);
}));

export default router;
