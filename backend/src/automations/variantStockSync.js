import prisma from '../lib/prisma.js';
const a = { name:'variant-stock-sync', description:'Sync variant stock from levels (no-op placeholder).', trigger:'cron:daily', async run(){ return { ok: true, note: 'wire to variant sync logic' }; } };
export default a;
