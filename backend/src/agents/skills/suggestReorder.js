import { z } from 'zod';
import prisma from '../../lib/prisma.js';

const inputSchema = z.object({}).strict().optional();

async function run() {
  const materials = await prisma.rawMaterial.findMany();
  const suggestions = materials
    .filter((m) => Number(m.onHand) <= Number(m.lowThreshold))
    .map((m) => ({ sku: m.sku, name: m.name, onHand: m.onHand, lowThreshold: m.lowThreshold, reorderQty: Math.max(Number(m.lowThreshold) * 2, 10) }));
  return { suggestions };
}

export default { name: 'suggest_reorder', description: 'Suggest reorder quantities for low-stock raw materials.', inputSchema, run };
