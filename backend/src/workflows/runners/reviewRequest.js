import prisma from '../../lib/prisma.js';

export async function run(input) {
  const orderId = input?.orderId;
  if (!orderId) return { ok: true, note: 'no orderId provided; nothing to do' };
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, status: true } });
  if (!order) return { ok: false, error: 'order not found' };
  return { ok: true, orderId, status: order.status, note: 'wire to review request email' };
}
