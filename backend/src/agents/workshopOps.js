import prisma from '../lib/prisma.js';
const agent = { name:'workshop-ops', description:'Workshop session ops summary.', tools:[], systemPrompt:'You manage workshops.', async run(){ const sessions = await prisma.workshopSession.findMany({ where: { startsAt: { gte: new Date() } }, take: 20 }); return { upcoming: sessions.length, sessions }; } };
export default agent;
