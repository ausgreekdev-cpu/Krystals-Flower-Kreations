import prisma from '../lib/prisma.js';
const agent = { name:'supabase-health', description:'Probe DB connectivity.', tools:[], systemPrompt:'Health probe.', async run(){ const r = await prisma.$queryRaw`SELECT 1 as ok`; return { ok: true, db: r }; } };
export default agent;
