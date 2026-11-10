import prisma from '../lib/prisma.js';
const a = { name:'negative-stock-alert', description:'Alert on negative inventory levels.', trigger:'cron:hourly', async run(){ const bad = await prisma.inventoryLevel.findMany({ where: { onHand: { lt: 0 } } }); return { count: bad.length, items: bad }; } };
export default a;
