import prisma from '../lib/prisma.js';
const a = { name:'slow-mover-flag', description:'Flag products with no recent sales (placeholder).', trigger:'cron:weekly', async run(){ const products = await prisma.product.findMany({ where: { deletedAt: null }, take: 50, select: { id: true, title: true } }); return { candidates: products.length }; } };
export default a;
