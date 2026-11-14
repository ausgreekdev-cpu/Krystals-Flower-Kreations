import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { llmAvailable, llmJson } from '../../services/llm.js';

const inputSchema = z.object({ names: z.array(z.string()).min(1) }).strict();

async function run(ctx) {
  const { names } = ctx.input;
  const materials = await prisma.rawMaterial.findMany({ select: { id: true, name: true, sku: true } });
  if (llmAvailable()) {
    try {
      const out = await llmJson({ system: 'Return JSON: {matches:[{input,matched,materialId}]}.', user: JSON.stringify({ names, materials }), maxTokens: 400 });
      return { matches: out.matches || [] };
    } catch (e) {}
  }
  const matches = names.map((n) => {
    const lower = n.toLowerCase();
    const hit = materials.find((m) => m.name.toLowerCase().includes(lower) || lower.includes(m.name.toLowerCase()));
    return { input: n, matched: !!hit, material: hit || null };
  });
  return { matches };
}

export default { name: 'match_materials', description: 'Fuzzy-match extracted material names to existing RawMaterial rows.', inputSchema, run };
