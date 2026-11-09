import { runSkill } from '../agents/skills/index.js';
import prisma from '../lib/prisma.js';
const agent = { name:'inventory-replenisher', description:'Draft reorder suggestions for low stock.', tools:['suggest_reorder'], systemPrompt:'You are an inventory replenisher.', async run(ctx){ const r = await runSkill('suggest_reorder', { input: {} }); await prisma.auditLog.create({ data: { action:'agent_run', entityType:'agent', entityId:'inventory-replenisher', metadata: r } }).catch(()=>{}); return r; } };
export default agent;
