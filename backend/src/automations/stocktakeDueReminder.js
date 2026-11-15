import prisma from '../lib/prisma.js';

const a = {
  name: 'stocktake-due-reminder',
  description: 'Remind to do stocktake.',
  trigger: 'cron:monthly',
  async run() {
    const count = await prisma.stocktake.count().catch(() => 0);
    return { ok: true, stocktakes: count };
  },
};
export default a;
