import { z } from 'zod';
import prisma from '../../lib/prisma.js';

const inputSchema = z.object({}).strict().optional();

async function run() {
  const levels = await prisma.inventoryLevel.findMany({ include: { product: { select: { title: true } } } });
  const anomalies = levels.filter((l) => Number(l.onHand) < 0).map((l) => ({ productId: l.productId, title: l.product?.title, onHand: l.onHand }));
  return { anomalies, count: anomalies.length };
}

export default { name: 'scan_inventory_anomalies', description: 'Find negative-stock inventory levels.', inputSchema, run };
