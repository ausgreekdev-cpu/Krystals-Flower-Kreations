import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { audit } from '../lib/audit.js';

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

// Allowed status transitions (keys = target status, values = allowed current statuses).
// waitlisted → confirmed is a capacity-checked seat promotion; waitlisted → attended
// is refused (it never held a real seat — promote first). No auto-promotion from the
// waitlist: waitlisted bookings paid nothing, so promoting would create unpaid
// confirmed bookings (staff promote manually via this route).
const TRANSITIONS = {
  confirmed: ['cancelled', 'waitlisted', 'pending'],
  cancelled: ['pending', 'confirmed', 'waitlisted', 'attended', 'no_show'],
  attended: ['pending', 'confirmed', 'no_show'],
  no_show: ['pending', 'confirmed', 'attended'],
};
// Statuses holding a real seat in session.bookedCount (pending never held one —
// the book route only ever creates confirmed/waitlisted).
const SEAT_HOLDERS = ['confirmed', 'attended', 'no_show'];

// Admin: cancel / restore / promote / mark attended / no-show / refund / edit notes.
const updateBookingSchema = z.object({
  status: z.enum(['confirmed', 'cancelled', 'attended', 'no_show']).optional(),
  notes: z.string().max(2000).optional().nullable(),
  refund: z.boolean().optional(),
}).refine((d) => d.status !== undefined || d.notes !== undefined || d.refund !== undefined, { message: 'Nothing to update' });
router.patch('/:id', requireAuth, requireRole('admin','developer','maker','staff'), validate(updateBookingSchema), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const d = req.validated;
  const result = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id }, include: { session: true, ticket: true } });
    if (!booking) throw Object.assign(new Error('Not found'), { status: 404, code: 'not_found' });
    const data = {};
    let statusChanged = false;
    if (d.status !== undefined && d.status !== booking.status) {
      const allowed = TRANSITIONS[d.status] || [];
      if (!allowed.includes(booking.status)) {
        throw Object.assign(new Error(`Cannot change a ${booking.status} booking to ${d.status}`), { status: 409, code: 'invalid_transition' });
      }
      statusChanged = true;
      if (d.status === 'cancelled') {
        // Free the seat (or waitlist slot) this booking was holding
        if (SEAT_HOLDERS.includes(booking.status)) {
          await tx.workshopSession.updateMany({ where: { id: booking.sessionId }, data: { bookedCount: { decrement: booking.quantity } } });
        } else if (booking.status === 'waitlisted') {
          await tx.workshopSession.updateMany({ where: { id: booking.sessionId }, data: { waitlistCount: { decrement: booking.quantity } } });
        }
        data.checkedInAt = null;
        if (booking.ticket?.checkedInAt) await tx.ticket.update({ where: { id: booking.ticket.id }, data: { checkedInAt: null } });
      } else if (d.status === 'confirmed') {
        // Restore / promote: atomically claim seats (mirrors the book route)
        const updated = await tx.workshopSession.updateMany({
          where: { id: booking.sessionId, bookedCount: { lte: booking.session.capacity - booking.quantity } },
          data: { bookedCount: { increment: booking.quantity } },
        });
        if (updated.count !== 1) throw Object.assign(new Error('This session is full'), { status: 409, code: 'session_full' });
        if (booking.status === 'waitlisted') {
          await tx.workshopSession.updateMany({ where: { id: booking.sessionId }, data: { waitlistCount: { decrement: booking.quantity } } });
        }
        data.checkedInAt = null;
        // Restored bookings must be check-in-able again
        if (booking.ticket?.checkedInAt) await tx.ticket.update({ where: { id: booking.ticket.id }, data: { checkedInAt: null } });
        // A restored waitlisted booking never had a ticket — mint one like the book route
        if (!booking.ticket) {
          const qrPayload = `KFK-T-WS-${booking.id.slice(-6).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
          await tx.ticket.create({ data: { bookingId: booking.id, qrPayload, qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrPayload)}` } });
        }
      } else if (d.status === 'attended') {
        data.checkedInAt = booking.checkedInAt || new Date();
        if (booking.ticket && !booking.ticket.checkedInAt) await tx.ticket.update({ where: { id: booking.ticket.id }, data: { checkedInAt: data.checkedInAt } });
      } else if (d.status === 'no_show') {
        data.checkedInAt = null;
        if (booking.ticket?.checkedInAt) await tx.ticket.update({ where: { id: booking.ticket.id }, data: { checkedInAt: null } });
      }
      data.status = d.status;
    }
    if (d.notes !== undefined) data.notes = d.notes;
    let refund = false;
    if (d.refund) {
      if (booking.refundedAt) throw Object.assign(new Error('Already refunded'), { status: 409, code: 'already_refunded' });
      if (Number(booking.totalPaid) <= 0) throw Object.assign(new Error('This booking has no payment to refund'), { status: 409, code: 'nothing_to_refund' });
      data.refundedAt = new Date();
      refund = true;
    }
    if (Object.keys(data).length === 0) return { nothing: true };
    const updated = await tx.booking.update({ where: { id }, data, include: { session: { include: { workshop: { select: { id: true, title: true } } } }, ticket: true } });
    return { nothing: false, statusChanged, refund, booking: updated };
  });
  if (!result.nothing) {
    audit({
      actorId: req.user.id, actorEmail: req.user.email,
      action: result.statusChanged ? 'booking_status_change' : (result.refund ? 'booking_refund' : 'booking_update'),
      entityType: 'booking', entityId: id,
      details: { status: result.booking.status, refund: result.refund, email: result.booking.email },
    });
  }
  res.json(result.nothing ? { id, unchanged: true } : result.booking);
}));

router.get('/tickets/:qrPayload', asyncHandler(async (req, res) => {
  const qr = String(req.params.qrPayload).slice(0,120);
  const ticket = await prisma.ticket.findUnique({ where: { qrPayload: qr }, include: { booking: { select: { id: true, name: true, quantity: true, status: true, session: { include: { workshop: { select: { id: true, title: true, location: true } } } } } } } });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found', code: 'not_found' });
  res.json(ticket);
}));

export default router;
