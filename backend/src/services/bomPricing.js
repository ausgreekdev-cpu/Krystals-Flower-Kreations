// Shared BOM pricing — deduped from bom.js:live and customOrders.js creation
// 7-stem baseline scaling, wasteFactor, labour $55/hr *1.3 + vase/greenery add-ons

export function scaleForStems(stemCount, baseline = 7) {
  return stemCount / baseline;
}

export function costForRecipe(recipe, qtyStems) {
  const scale = scaleForStems(qtyStems);
  let materialsCost = 0;
  const breakdown = (recipe.lines || []).map(l => {
    const eff = l.qtyPerUnit * (1 + (l.wasteFactor || 0)) * scale;
    const cost = eff * (l.rawMaterial?.costPerUnit ?? 0);
    materialsCost += cost;
    return { sku: l.rawMaterial?.sku, name: l.rawMaterial?.name, unit: l.rawMaterial?.unit, perUnit: l.qtyPerUnit, wasteFactor: l.wasteFactor, effectiveQty: eff, cost, onHand: l.rawMaterial?.onHand, low: l.rawMaterial ? l.rawMaterial.onHand <= l.rawMaterial.lowThreshold : false };
  });
  const labourMinutes = Math.round(((recipe.labourMinutesPerUnit || 0) + (recipe.cricutMinutesPerUnit || 0)) * scale);
  const LABOUR_RATE = 55 / 60;
  const withLabour = materialsCost + labourMinutes * LABOUR_RATE;
  const retail = Math.round(withLabour * 1.30 * 100) / 100;
  return { materialsCost: Math.round(materialsCost * 100) / 100, labourMinutes, withLabour: Math.round(withLabour * 100) / 100, retail, breakdown };
}

export function estimateWithAddOns(baseRetail, spec) {
  let total = baseRetail;
  if (spec?.vaseIncluded) total += 22;
  if (spec?.addGreenery) total += 12;
  return Math.max(45 + (spec?.stemCount || 7) * 9.5, total);
}

export async function findRecipeFor(prisma, { productId, variantId }) {
  let recipe = null;
  if (variantId) recipe = await prisma.bOMRecipe.findFirst({ where: { variantId }, include: { lines: { include: { rawMaterial: true } } } });
  if (!recipe && productId) recipe = await prisma.bOMRecipe.findFirst({ where: { productId, variantId: null }, include: { lines: { include: { rawMaterial: true } } } });
  if (!recipe) recipe = await prisma.bOMRecipe.findFirst({ include: { lines: { include: { rawMaterial: true } } } });
  return recipe;
}
