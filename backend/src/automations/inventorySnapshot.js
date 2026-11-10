import prisma from '../lib/prisma.js';
const a = { name:'inventory-snapshot', description:'Snapshot inventory levels to audit.', trigger:'cron:weekly', async run(){ const levels = await prisma.inventoryLevel.findMany(); await prisma.auditLog.create({ data: { action: 'inventory_snapshot', entityType: 'system', entityId: 'snapshot', details: { count: levels.length, at: new Date() } } }).catch(()=>{}); return { count: levels.length }; } };
export default a;
