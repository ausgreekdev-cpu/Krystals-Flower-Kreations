import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { llmAvailable, llmJson } from '../../services/llm.js';

const inputSchema = z.object({ templateId: z.string().min(1) }).strict();

async function run(ctx) {
  const { templateId } = ctx.input;
  const recipe = await prisma.bOMRecipe.findUnique({ where: { templateId }, include: { lines: { include: { rawMaterial: true } } } });
  if (!recipe) return { ok: false, reason: 'no recipe' };
  const labourRate = Number((await prisma.setting.findUnique({ where: { key: 'labour_rate_per_hour' } }))?.value || 55);
  const margin = Number((await prisma.setting.findUnique({ where: { key: 'bom_margin' } }))?.value || 1.3);
  const materialCost = recipe.lines.reduce((s, l) => s + Number(l.rawMaterial.costPerUnit) * Number(l.qtyPerUnit) * (1 + Number(l.wasteFactor)), 0);
  const labourCost = ((recipe.labourMinutesPerUnit + recipe.cricutMinutesPerUnit) / 60) * labourRate;
  const cost = materialCost + labourCost;
  const retail = cost * margin;
  if (llmAvailable()) {
    try {
      const out = await llmJson({ system: 'Return JSON: {suggestedRetail, note}.', user: JSON.stringify({ templateId, cost, retail }), maxTokens: 150 });
      return { templateId, materialCost, labourCost, cost, margin, retail, suggestedRetail: out.suggestedRetail, note: out.note };
    } catch (e) {}
  }
  return { templateId, materialCost, labourCost, cost, margin, retail };
}

export default { name: 'price_proposal', description: 'Compute BOM cost + margin retail for a template recipe.', inputSchema, run };
