import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { llmAvailable, llmJson } from '../../services/llm.js';

const inputSchema = z.object({ productId: z.string().min(1) }).strict();

async function run(ctx) {
  const { productId } = ctx.input;
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { title: true, price: true } });
  if (!p) throw new Error('product not found');
  if (llmAvailable()) {
    try {
      const out = await llmJson({ system: 'Return JSON: {caption, hashtags}.', user: JSON.stringify(p), maxTokens: 200 });
      return { caption: out.caption || `${p.title}`, hashtags: Array.isArray(out.hashtags) ? out.hashtags : [] };
    } catch (e) {}
  }
  const caption = `New in the studio: ${p.title} — $${Number(p.price).toFixed(2)} AUD. Handmade in Perth. #paperflowers #perthflorist #handmadeinperth`;
  return { caption, hashtags: ['#paperflowers', '#perthflorist', '#handmadeinperth'] };
}

export default { name: 'draft_social_post', description: 'Draft an Instagram/Facebook post for a product.', inputSchema, run };
