import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { llmAvailable, llmJson } from '../../services/llm.js';

const inputSchema = z.object({}).strict().optional();

async function run() {
  const materials = await prisma.rawMaterial.findMany();
  const low = materials.filter((m) => Number(m.onHand) <= Number(m.lowThreshold));
  if (llmAvailable() && low.length) {
    try {
      const out = await llmJson({ system: 'Return JSON: {suggestions:[{sku,reorderQty,reason}]}.', user: JSON.stringify(low), maxTokens: 400 });
      return { suggestions: out.suggestions || [] };
    } catch (e) {}
  }
  const suggestions = low.map((m) => ({ sku: m.sku, name: m.name, onHand: m.onHand, lowThreshold: m.lowThreshold, reorderQty: Math.max(Number(m.lowThreshold) * 2, 10) }));
  return { suggestions };
}

export default { name: 'suggest_reorder', description: 'Suggest reorder quantities for low-stock raw materials.', inputSchema, run };
