import prisma from '../lib/prisma.js';
const a = { name:'new-order-notify', description:'Notify admin on new order.', trigger:'order.created', async run(ctx){ const o = ctx?.order; console.log('[new-order-notify]', o?.id, o?.total); return { notified: !!o }; } };
export default a;
