import prisma from '../lib/prisma.js';

const a = {
  name: 'variant-stock-sync',
  description: 'Sync variant stock from levels (placeholder).',
  trigger: 'cron:daily',
  async run() {
    const variants = await prisma.productVariant.count().catch(() => 0);
    return { ok: true, variants };
  },
};
export default a;
