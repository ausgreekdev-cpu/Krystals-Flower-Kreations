import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';

const router = Router();

// Check-in by QR payload (POS or workshop door)
router.post('/check-in', requireAuth, async (req, res) => {
  const { qrPayload } = req.body;
  if (!qrPayload) return res.status(400).json({ error: 'qrPayload required' });
  const ticket = await prisma.ticket.findUnique({ where: { qrPayload }, include: { booking: { include: { session: true } }, customArtOrder: true } });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  if (ticket.checkedInAt) return res.status(409).json({ error: 'Already checked in', ticket });
  const updated = await prisma.ticket.update({ where: { id: ticket.id }, data: { checkedInAt: new Date() } });
  // Also mark booking/order attended if applicable
  if (ticket.bookingId) await prisma.booking.update({ where: { id: ticket.bookingId }, data: { status: 'attended', checkedInAt: new Date() } }).catch(()=>{});
  if (ticket.customArtOrderId) await prisma.customArtOrder.update({ where: { id: ticket.customArtOrderId }, data: { state: 'dispatched_pickup_ready', dispatchedAt: new Date() } }).catch(()=>{});
  res.json({ ok: true, ticket: updated });
});

router.get('/:qrPayload', async (req, res) => {
  const ticket = await prisma.ticket.findUnique({ where: { qrPayload: req.params.qrPayload }, include: { booking: true, customArtOrder: true } });
  if (!ticket) return res.status(404).json({ error: 'Not found' });
  res.json(ticket);
});

export default router;
