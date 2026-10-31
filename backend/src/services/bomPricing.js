// Shared BOM pricing — deduped from bom.js:live and customOrders.js creation
// 7-stem baseline scaling, wasteFactor, labour + margin (DB settings) + vase/greenery add-ons
import prisma from '../lib/prisma.js';

export function scaleForStems(stemCount, baseline = 7) {
  return stemCount / baseline;
}

// Read labour rate ($/hr) + retail margin from settings (fallbacks 55 / 1.30)
export async function pricingConfig() {
  let labourPerHour = 55;
  let margin = 1.30;
  try {
    const [labourRow, marginRow] = await Promise.all([
      prisma.setting.findUnique({ where: { key: 'labour_rate_per_hour' } }),
      prisma.setting.findUnique({ where: { key: 'bom_margin' } }),
    ]);
    if (labourRow?.value) labourPerHour = Number(labourRow.value) || labourPerHour;
    if (marginRow?.value) margin = Number(marginRow.value) || margin;
  } catch {}
  return { labourPerHour, margin };
}

export async function costForRecipe(recipe, qtyStems) {
  const { labourPerHour, margin } = await pricingConfig();
  const scale = scaleForStems(qtyStems);
  let materialsCost = 0;
  const breakdown = (recipe.lines || []).map(l => {
    const eff = l.qtyPerUnit * (1 + (l.wasteFactor || 0)) * scale;
    const cost = eff * Number(l.rawMaterial?.costPerUnit ?? 0);
    materialsCost += cost;
    return { sku: l.rawMaterial?.sku, name: l.rawMaterial?.name, unit: l.rawMaterial?.unit, perUnit: l.qtyPerUnit, wasteFactor: l.wasteFactor, effectiveQty: eff, cost, onHand: l.rawMaterial?.onHand, low: l.rawMaterial ? l.rawMaterial.onHand <= l.rawMaterial.lowThreshold : false };
  });
  const labourMinutes = Math.round(((recipe.labourMinutesPerUnit || 0) + (recipe.cricutMinutesPerUnit || 0)) * scale);
  const LABOUR_RATE = labourPerHour / 60;
  const withLabour = materialsCost + labourMinutes * LABOUR_RATE;
  const retail = Math.round(withLabour * margin * 100) / 100;
  return { materialsCost: Math.round(materialsCost * 100) / 100, labourMinutes, withLabour: Math.round(withLabour * 100) / 100, retail, breakdown };
}

export function estimateWithAddOns(baseRetail, spec, addOns = {}) {
  const { vase = 22, greenery = 12, dome = 45, led = 18, floor = 45, perStem = 9.5 } = addOns;
  let total = baseRetail;
  if (spec?.vaseIncluded) total += vase;
  if (spec?.addGreenery) total += greenery;
  if (spec?.domeIncluded) total += dome;
  if (spec?.ledIncluded) total += led;
  return Math.max(floor + (spec?.stemCount || 7) * perStem, total);
}

// Suggest substitute raw materials when a material is out of stock.
// Matches by unit, weightValue, colour, and size (fuzzy on name).
export async function suggestSubstitutes(prisma, material, limit = 5) {
  if (!material) return [];
  const candidates = await prisma.rawMaterial.findMany({
    where: {
      id: { not: material.id },
      onHand: { gt: 0 },
      unit: material.unit,
    },
    take: 50,
  });
  const scored = candidates.map((c) => {
    let score = 0;
    if (material.weightValue && c.weightValue === material.weightValue) score += 3;
    if (material.colour && c.colour && c.colour.toLowerCase() === material.colour.toLowerCase()) score += 2;
    if (material.size && c.size && c.size.toLowerCase() === material.size.toLowerCase()) score += 2;
    if (material.brand && c.brand && c.brand.toLowerCase() === material.brand.toLowerCase()) score += 1;
    // name similarity (simple: shared words)
    const mWords = new Set(String(material.name || '').toLowerCase().split(/\s+/));
    const cWords = String(c.name || '').toLowerCase().split(/\s+/);
    score += cWords.filter((w) => mWords.has(w) && w.length > 2).length;
    return { ...c, score };
  });
  return scored.filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function findRecipeFor(prisma, { productId, variantId, templateId }) {
  const include = { lines: { include: { rawMaterial: true } } };
  // Parallelize the lookups
  const [byTemplate, byVariant, byProduct] = await Promise.all([
    templateId ? prisma.bOMRecipe.findUnique({ where: { templateId }, include }) : null,
    variantId ? prisma.bOMRecipe.findFirst({ where: { variantId }, include }) : null,
    productId ? prisma.bOMRecipe.findFirst({ where: { productId, variantId: null }, include }) : null,
  ]);
  return byTemplate || byVariant || byProduct || null;
}
