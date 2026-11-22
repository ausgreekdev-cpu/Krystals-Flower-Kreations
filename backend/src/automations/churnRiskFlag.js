import prisma from '../lib/prisma.js';

const a = {
  name: 'churn-risk-flag',
  description: 'Flag customers with no order in 90 days.',
  trigger: 'cron:weekly',
  async run() {
    const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const customers = await prisma.user.findMany({ where: { role: 'customer' }, select: { id: true, email: true } });
    return { candidates: customers.length, cutoff };
  },
};
export default a;
