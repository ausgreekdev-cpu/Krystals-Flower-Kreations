import prisma from '../lib/prisma.js';

const a = {
  name: 'vip-flag',
  description: 'Mark VIP customers on 5th order.',
  trigger: 'event:order.created',
  async run(ctx) {
    const order = ctx?.order;
    if (!order?.customerEmail) return { ok: true, skipped: true };
    const count = await prisma.order.count({ where: { customerEmail: order.customerEmail } }).catch(() => 0);
    return { ok: true, orderCount: count, vip: count >= 5 };
  },
};
export default a;
