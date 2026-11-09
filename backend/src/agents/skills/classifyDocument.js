import { z } from 'zod';
import { llmAvailable, llmJson } from '../../services/llm.js';

const inputSchema = z.object({ title: z.string().min(1), text: z.string().optional() }).strict();

async function run(ctx) {
  const { title, text } = ctx.input;
  if (llmAvailable()) {
    try {
      const out = await llmJson({ system: 'Return JSON: {category, tags, confidence}.', user: JSON.stringify({ title, text }), maxTokens: 200 });
      return { category: out.category || 'OTHER', tags: Array.isArray(out.tags) ? out.tags : [], confidence: Number(out.confidence || 0.5) };
    } catch (e) {}
  }
  const hay = `${title} ${text || ''}`;
  const RULES = [
    { re: /stocktake|inventory/i, category: 'STOCKTAKE' },
    { re: /invoice|receipt/i, category: 'INVOICE' },
    { re: /supplier|vendor/i, category: 'SUPPLIER' },
    { re: /procedure|sop|guide/i, category: 'PROCEDURE' },
    { re: /export|backup/i, category: 'EXPORT' },
  ];
  const hit = RULES.find((r) => r.re.test(hay));
  const category = hit ? hit.category : 'OTHER';
  const tags = (hay.toLowerCase().match(/\b[a-z]{4,}\b/g) || []).slice(0, 8);
  return { category, tags: [...new Set(tags)], confidence: hit ? 0.7 : 0.3 };
}

export default { name: 'classify_document', description: 'Classify a document into a category with tags.', inputSchema, run };
