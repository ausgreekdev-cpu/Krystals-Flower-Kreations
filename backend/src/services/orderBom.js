// Production BOM snapshot generated at checkout finalize — "the checkout
// completion auto-generates the Bill of Materials (paper stock, wire gauges,
// estimated craft labor hours)".
//
// Reads the studio BOM recipes (RawMaterial lines + labour/cricut minutes per
// unit), scales by the ordered quantities and stores the result on
// Order.bomSnapshot for the production board. Best-effort: like the digital
// download minting, a failure here must never block an order.
import prisma from '../lib/prisma.js';
import { findRecipeFor, costForRecipe } from './bomPricing.js';

// bomEngine.js parity: labour hours drive the lead time (min 3 days).
export function leadDaysFor(labourMinutes) {
  return Math.max(3, Math.ceil((labourMinutes / 60) / 2));
}

// Pure snapshot builder — lines carry pre-computed per-line BOM data:
// [{ orderLineId, title, quantity, recipeId, labourMinutes, materialsCost, materials: [{ sku, name, unit, qty, cost }] }]
export function buildBOMSnapshot(lines) {
  const materials = new Map();
  let labourMinutes = 0;
  let materialsCost = 0;
  for (const line of lines) {
    labourMinutes += line.labourMinutes || 0;
    materialsCost += line.materialsCost || 0;
    for (const m of line.materials || []) {
      const key = m.sku || m.name;
      const agg = materials.get(key) || { sku: m.sku, name: m.name, unit: m.unit, qty: 0, cost: 0 };
      agg.qty += m.qty || 0;
      agg.cost += m.cost || 0;
      materials.set(key, agg);
    }
  }
  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    generatedAt: new Date().toISOString(),
    lines,
    materials: [...materials.values()].map((m) => ({ ...m, qty: round2(m.qty), cost: round2(m.cost) })),
    materialsCost: round2(materialsCost),
    labourMinutes: Math.round(labourMinutes),
    labourHours: round2(labourMinutes / 60),
    estimatedLeadDays: leadDaysFor(labourMinutes),
  };
}

// Compute + persist the snapshot for an order (lines must be included).
export async function generateOrderBOM(order) {
  if (!order?.id || !Array.isArray(order.lines) || !order.lines.length) return null;
  const lineBoms = [];
  for (const line of order.lines) {
    // Digital lines have nothing to produce.
    if (line.isDigital) continue;
    const recipe = await findRecipeFor(prisma, { productId: line.productId, variantId: line.variantId });
    if (recipe) {
      // costForRecipe scales by stems over a 7-stem baseline — 7 × units
      const est = await costForRecipe(recipe, 7 * (Number(line.quantity) || 1));
      lineBoms.push({
        orderLineId: line.id, title: line.title, quantity: line.quantity,
        recipeId: recipe.id, labourMinutes: est.labourMinutes, materialsCost: est.materialsCost,
        materials: (est.breakdown || []).map((b) => ({ sku: b.sku, name: b.name, unit: b.unit, qty: b.effectiveQty, cost: b.cost })),
      });
    } else {
      // No recipe anywhere in the studio — fallback estimate (mirrors /bom/live).
      const units = Number(line.quantity) || 1;
      lineBoms.push({
        orderLineId: line.id, title: line.title, quantity: line.quantity,
        recipeId: null, labourMinutes: (25 + 8) * units, materialsCost: 0,
        materials: [], note: 'No recipe — fallback estimate',
      });
    }
  }
  if (!lineBoms.length) return null;
  const snapshot = buildBOMSnapshot(lineBoms);
  await prisma.order.update({ where: { id: order.id }, data: { bomSnapshot: snapshot } });
  return snapshot;
}
