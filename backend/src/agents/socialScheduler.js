import { runSkill } from '../agents/skills/index.js';
import prisma from '../lib/prisma.js';
const agent = { name:'social-scheduler', description:'Draft social posts for recent products.', tools:['draft_social_post'], systemPrompt:'Social scheduler.', async run(){ const products = await prisma.product.findMany({ take: 5, orderBy: { createdAt: 'desc' }, select: { id: true } }); const posts = []; for (const p of products) posts.push(await runSkill('draft_social_post', { input: { productId: p.id } }).catch(e=>({error:e.message}))); return { posts }; } };
export default agent;
