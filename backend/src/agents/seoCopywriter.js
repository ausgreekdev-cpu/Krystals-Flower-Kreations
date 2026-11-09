import { runSkill } from '../agents/skills/index.js';
const agent = { name:'seo-copywriter', description:'Generate SEO copy for a product.', tools:['generate_seo_copy'], systemPrompt:'SEO copywriter.', async run(ctx){ return runSkill('generate_seo_copy', { input: { productId: ctx.input.productId } }); } };
export default agent;
