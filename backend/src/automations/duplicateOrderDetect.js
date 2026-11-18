import prisma from '../lib/prisma.js';

const a = {
  name: 'duplicate-order-detect',
  description: 'Flag duplicate orders within 1h.',
  trigger: 'event:order.created',
  async run(ctx) {
    const order = ctx?.order;
    if (!order?.customerEmail) return { ok: true, skipped: true };
    const cutoff = new Date(Date.now() - 3600000);
    const dupes = await prisma.order.count({ where: { customerEmail: order.customerEmail, createdAt: { gte: cutoff }, id: { not: order.id } } }).catch(() => 0);
    return { ok: true, duplicates: dupes };
  },
};
export default a;
