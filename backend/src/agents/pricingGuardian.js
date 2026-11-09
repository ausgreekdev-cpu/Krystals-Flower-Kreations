import { runSkill } from '../agents/skills/index.js';
import prisma from '../lib/prisma.js';
const agent = { name:'pricing-guardian', description:'Flag margin issues across templates.', tools:['price_proposal'], systemPrompt:'Pricing guardian.', async run(){ const recipes = await prisma.bOMRecipe.findMany({ where: { templateId: { not: null } }, select: { templateId: true } }); const results = []; for (const r of recipes) results.push(await runSkill('price_proposal', { input: { templateId: r.templateId } }).catch(e=>({templateId:r.templateId,error:e.message}))); return { results }; } };
export default agent;
