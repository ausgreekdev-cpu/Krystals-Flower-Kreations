import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { rateLimit } from '../middleware/rate-limit.js';
const requireAuth = authenticate;
const checkInLimit = rateLimit('ticket_checkin', 30, 1);

const router = Router();

// Check-in by QR payload (POS or workshop door) — idempotent + rate-limited.
// Staff-gated: check-in flips orders/attendances so customers must not call it.
router.post('/check-in', requireAuth, requireRole('admin','developer','maker','staff'), checkInLimit, validate(z.object({ qrPayload: z.string().min(8).max(120) }).strict()), asyncHandler(async (req, res) => {
  const { qrPayload } = req.validated;
  const ticket = await prisma.ticket.findUnique({ where: { qrPayload }, include: { booking: { include: { session: true } }, customArtOrder: true } });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  if (ticket.checkedInAt) return res.status(409).json({ error: 'Already checked in', ticket });
  const updated = await prisma.ticket.update({ where: { id: ticket.id }, data: { checkedInAt: new Date() } });
  if (ticket.bookingId) await prisma.booking.update({ where: { id: ticket.bookingId }, data: { status: 'attended', checkedInAt: new Date() } }).catch(()=>{});
  if (ticket.customArtOrderId) await prisma.customArtOrder.update({ where: { id: ticket.customArtOrderId }, data: { state: 'dispatched_pickup_ready', dispatchedAt: new Date() } }).catch(()=>{});
  res.json({ ok: true, ticket: updated });
}));

router.get('/:qrPayload', requireAuth, asyncHandler(async (req, res) => {
  const qr = String(req.params.qrPayload).slice(0,120);
  if (!/^[A-Z0-9\-_]+$/.test(qr)) return res.status(400).json({ error: 'Invalid QR', code: 'validation_failed' });
  const ticket = await prisma.ticket.findUnique({ where: { qrPayload: qr }, include: { booking: { include: { session: { include: { workshop: true } } } }, customArtOrder: true } });
  if (!ticket) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  // Ownership: staff can view any; customers only their own booking/order
  const isStaff = ['admin','developer','maker','staff'].includes(req.user.role);
  if (!isStaff) {
    const email = (req.user.email || '').toLowerCase();
    const owns = (ticket.booking && ticket.booking.email.toLowerCase() === email) ||
                 (ticket.customArtOrder && ticket.customArtOrder.customerEmail?.toLowerCase() === email);
    if (!owns) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  }
  res.json(ticket);
}));

export default router;
