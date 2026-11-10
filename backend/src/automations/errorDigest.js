import prisma from '../lib/prisma.js';
const a = { name:'error-digest', description:'Summarize recent DLQ entries.', trigger:'cron:daily', async run(){ const entries = await prisma.dLQEntry.findMany({ where: { createdAt: { gte: new Date(Date.now()-86400000) } } }); return { count: entries.length }; } };
export default a;
