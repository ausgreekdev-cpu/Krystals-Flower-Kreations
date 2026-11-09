import prisma from '../lib/prisma.js';
const a = { name:'cart-cleanup', description:'Delete stale carts.', trigger:'cron:hourly', async run(){ const cutoff = new Date(Date.now() - 7*24*3600*1000); const r = await prisma.cart.deleteMany({ where: { updatedAt: { lt: cutoff } } }); return r; } };
export default a;
