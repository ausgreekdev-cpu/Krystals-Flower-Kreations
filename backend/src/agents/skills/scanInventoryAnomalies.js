import { z } from 'zod';
import prisma from '../../lib/prisma.js';
import { llmAvailable, llmJson } from '../../services/llm.js';

const inputSchema = z.object({}).strict().optional();

async function run() {
  const levels = await prisma.inventoryLevel.findMany({ include: { product: { select: { title: true } } } });
  const anomalies = levels.filter((l) => Number(l.onHand) < 0).map((l) => ({ productId: l.productId, title: l.product?.title, onHand: l.onHand }));
  if (llmAvailable() && anomalies.length) {
    try {
      const out = await llmJson({ system: 'Return JSON: {summary}.', user: JSON.stringify(anomalies), maxTokens: 200 });
      return { anomalies, count: anomalies.length, summary: out.summary || '' };
    } catch (e) {}
  }
  return { anomalies, count: anomalies.length };
}

export default { name: 'scan_inventory_anomalies', description: 'Find negative-stock inventory levels.', inputSchema, run };
