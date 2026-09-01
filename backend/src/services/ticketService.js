import prisma from '../lib/prisma.js';

export async function checkIn(qrPayload) {
  const ticket = await prisma.ticket.findUnique({ where: { qrPayload }, include: { booking: { include: { session: true } }, customArtOrder: true } });
  if (!ticket) {
    const err = new Error('Ticket not found'); err.status = 404; err.code = 'not_found'; throw err;
  }
  if (ticket.checkedInAt) {
    const err = new Error('Already checked in'); err.status = 409; err.code = 'conflict'; throw err;
  }
  const updated = await prisma.ticket.update({ where: { id: ticket.id }, data: { checkedInAt: new Date() } });
  if (ticket.bookingId) await prisma.booking.update({ where: { id: ticket.bookingId }, data: { status: 'attended', checkedInAt: new Date() } }).catch(()=>{});
  if (ticket.customArtOrderId) await prisma.customArtOrder.update({ where: { id: ticket.customArtOrderId }, data: { state: 'dispatched_pickup_ready', dispatchedAt: new Date() } }).catch(()=>{});
  return updated;
}

export async function findByPayload(qrPayload) {
  return prisma.ticket.findUnique({ where: { qrPayload }, include: { booking: { include: { session: { include: { workshop: true } } } }, customArtOrder: true } });
}
