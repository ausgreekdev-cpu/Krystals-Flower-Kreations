import { z } from 'zod';
import prisma from '../../lib/prisma.js';

const inputSchema = z.object({ names: z.array(z.string()).min(1) }).strict();

async function run(ctx) {
  const { names } = ctx.input;
  const materials = await prisma.rawMaterial.findMany({ select: { id: true, name: true, sku: true } });
  const matches = names.map((n) => {
    const lower = n.toLowerCase();
    const hit = materials.find((m) => m.name.toLowerCase().includes(lower) || lower.includes(m.name.toLowerCase()));
    return { input: n, matched: !!hit, material: hit || null };
  });
  return { matches };
}

export default { name: 'match_materials', description: 'Fuzzy-match extracted material names to existing RawMaterial rows.', inputSchema, run };
