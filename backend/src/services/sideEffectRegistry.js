// Side-effect registry (Phase 2): maps operation names to executable functions
// so failed side effects can be retried from the admin panel.
//
// Each registered function receives the stored context and returns a result.
// Add new operations here as they're created.
import { consumeOrderMaterials } from './orderBom.js';
import { replenishLowStock } from './replenishment.js';
import { recalculateRecipeCosts } from './costRecalc.js';
import prisma from '../lib/prisma.js';

const registry = {
  consumeOrderMaterials: async (ctx) => {
    const order = await prisma.order.findUnique({ where: { id: ctx.entityId }, include: { lines: true } });
    if (!order) throw new Error('Order not found');
    return consumeOrderMaterials(order);
  },
  replenishLowStock: async (ctx) => {
    return replenishLowStock(ctx.userId || null);
  },
  recalculateRecipeCosts: async (ctx) => {
    return recalculateRecipeCosts(ctx.entityId, ctx.userId || null);
  },
};

export function getRetryableOps() { return Object.keys(registry); }
export function isRetryable(name) { return name in registry; }

export async function executeSideEffect(name, context) {
  const fn = registry[name];
  if (!fn) throw new Error(`Unknown side effect: ${name}`);
  return fn(context);
}
