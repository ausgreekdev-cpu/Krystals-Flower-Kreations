import prisma from '../lib/prisma.js';

const THRESHOLD = 500;
const a = {
  name: 'high-value-order-alert',
  description: `Alert when an order exceeds $${THRESHOLD}.`,
  trigger: 'event:order.created',
  async run(ctx) {
    const total = Number(ctx?.order?.total || 0);
    if (total >= THRESHOLD) return { alert: true, total };
    return { alert: false, total };
  },
};
export default a;
