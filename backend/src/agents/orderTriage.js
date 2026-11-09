import prisma from '../lib/prisma.js';
const agent = { name:'order-triage', description:'Classify orders for fulfillment routing.', tools:[], systemPrompt:'You triage orders.', async run(ctx){ const orders = await prisma.order.findMany({ take: 50, orderBy: { createdAt: 'desc' }, select: { id:true, status:true, paymentStatus:true } }); return { count: orders.length, orders }; } };
export default agent;
