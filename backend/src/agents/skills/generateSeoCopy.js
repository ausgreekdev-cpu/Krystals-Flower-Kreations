import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { llmAvailable, llmJson } from '../../services/llm.js';

const inputSchema = z.object({
  productId: z.string().min(1),
}).strict();

async function run(ctx) {
  const { productId } = ctx.input;
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, title: true, description: true, flowerType: true, colourFamily: true, occasions: true } });
  if (!product) throw new Error('product not found');

  if (llmAvailable()) {
    try {
      const out = await llmJson({ system: 'Return JSON: {metaTitle, metaDescription, tags}.', user: JSON.stringify(product), maxTokens: 300 });
      const metaTitle = String(out.metaTitle || product.title).slice(0, 60);
      const metaDescription = String(out.metaDescription || product.description || '').slice(0, 160);
      const tags = Array.isArray(out.tags) ? out.tags : [];
      await prisma.product.update({ where: { id: productId }, data: { metaTitle, metaDescription } });
      return { metaTitle, metaDescription, tags };
    } catch (e) { /* fall through */ }
  }

  const metaTitle = `${product.title} — Krystal's Flower Kreations`.slice(0, 60);
  const metaDescription = (product.description || `${product.title} handcrafted paper flower.`).slice(0, 160);
  const tags = [product.flowerType, product.colourFamily, ...(product.occasions || [])].filter(Boolean);
  await prisma.product.update({ where: { id: productId }, data: { metaTitle, metaDescription } });
  return { metaTitle, metaDescription, tags };
}

export default { name: 'generate_seo_copy', description: 'Generate SEO meta title/description/tags for a product.', inputSchema, run };
