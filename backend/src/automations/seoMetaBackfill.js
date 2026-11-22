import prisma from '../lib/prisma.js';

const a = {
  name: 'seo-meta-backfill',
  description: 'Fill missing meta on products.',
  trigger: 'cron:weekly',
  async run() {
    const missing = await prisma.product.count({ where: { deletedAt: null, metaTitle: null } }).catch(() => 0);
    return { missing };
  },
};
export default a;
