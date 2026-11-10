import prisma from '../lib/prisma.js';
const a = { name:'order-stuck-in-pending', description:'Flag orders pending >24h.', trigger:'cron:daily', async run(){ const cutoff = new Date(Date.now()-86400000); const stuck = await prisma.order.findMany({ where: { status: 'pending_payment', createdAt: { lt: cutoff } } }); return { count: stuck.length }; } };
export default a;
