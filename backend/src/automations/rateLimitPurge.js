import prisma from '../lib/prisma.js';
const a = { name:'rate-limit-purge', description:'Purge expired rate limit buckets.', trigger:'cron:hourly', async run(){ const r = await prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date() } } }).catch(()=>({count:0})); return r; } };
export default a;
