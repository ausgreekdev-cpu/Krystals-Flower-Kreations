import prisma from '../lib/prisma.js';
const a = { name:'db-health-check', description:'Probe DB connectivity.', trigger:'cron:hourly', async run(){ await prisma.$queryRaw`SELECT 1`; return { ok: true }; } };
export default a;
