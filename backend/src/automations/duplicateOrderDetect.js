import prisma from '../lib/prisma.js';

const a = {
  name: 'duplicate-order-detect',
  description: 'Flag duplicate orders within 1h (stub).',
  trigger: 'event:order.created',
  async run(ctx) {
    return { ok: true, ctx };
  },
};
export default a;
