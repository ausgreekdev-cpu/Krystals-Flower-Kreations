import prisma from '../lib/prisma.js';
const a = { name:'stale-draft-cleanup', description:'Archive stale drafts.', trigger:'cron:weekly', async run(){ const cutoff = new Date(Date.now() - 90*24*3600*1000); const r = await prisma.product.updateMany({ where: { status: 'draft', updatedAt: { lt: cutoff } }, data: { deletedAt: new Date() } }).catch(()=>({count:0})); return r; } };
export default a;
