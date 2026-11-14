import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { llmAvailable, llmJson } from '../../services/llm.js';

const inputSchema = z.object({ productId: z.string().optional() }).strict().optional();

async function run(ctx) {
  const where = ctx?.input?.productId ? { productId: ctx.input.productId } : {};
  const reviews = await prisma.review.findMany({ where, select: { rating: true, body: true } });
  const avg = reviews.length ? reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length : 0;
  if (llmAvailable() && reviews.length) {
    try {
      const out = await llmJson({ system: 'Return JSON: {summary}.', user: JSON.stringify(reviews.slice(0, 20)), maxTokens: 200 });
      return { count: reviews.length, averageRating: Number(avg.toFixed(2)), summary: out.summary || '' };
    } catch (e) {}
  }
  return { count: reviews.length, averageRating: Number(avg.toFixed(2)) };
}

export default { name: 'summarize_reviews', description: 'Summarize review ratings for a product or all.', inputSchema, run };
