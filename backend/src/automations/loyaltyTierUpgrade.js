import prisma from '../lib/prisma.js';

const a = {
  name: 'loyalty-tier-upgrade',
  description: 'Upgrade loyalty tier on points threshold.',
  trigger: 'event:loyalty.points',
  async run(ctx) {
    const { account, points } = ctx || {};
    return { ok: true, accountId: account?.id, points };
  },
};
export default a;
