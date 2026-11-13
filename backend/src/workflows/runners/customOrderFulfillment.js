import prisma from '../../lib/prisma.js';

export async function run(input) {
  const orderId = input?.orderId;
  if (!orderId) return { ok: true, note: 'no orderId provided; nothing to do' };
  const order = await prisma.customArtOrder.findUnique({ where: { id: orderId } }).catch(() => null);
  if (!order) return { ok: false, error: 'custom order not found' };
  return { ok: true, orderId, status: order.status };
}
