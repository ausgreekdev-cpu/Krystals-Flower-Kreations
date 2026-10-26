import prisma from '../lib/prisma.js';
import { pricingConfig } from './bomPricing.js';
import { getSettings } from '../lib/settingsSchema.js';

// Single source of truth for custom order price/minutes
// spec: { paperColor, paperTexture, weight, stemCount, heightMm, templateId, addGreenery, vaseIncluded, domeIncluded, ledIncluded, palette, paperStockId, notes }
// Returns { total, estimatedMinutes, bomSnapshot, costPrice, lines: bomSnapshot, paperPremiumTotal, addOnsTotal }
export async function quoteCustomOrder(spec) {
  const stemCount = Number(spec.stemCount) || 7;
  let recipe = null;
  if (spec.templateId) {
    recipe = await prisma.bOMRecipe.findUnique({ where: { templateId: spec.templateId }, include: { lines: { include: { rawMaterial: true } } } });
  }
  // No arbitrary fallback — if no recipe, bomSnapshot stays empty (handled by caller)
  let bomSnapshot = [];
  let costPrice = 0;
  let estimatedMinutes = 0;
  if (recipe) {
    const baseline = 7;
    const scale = stemCount / baseline;
    for (const l of recipe.lines) {
      const eff = l.qtyPerUnit * (1 + (l.wasteFactor || 0)) * scale;
      const cost = eff * Number(l.rawMaterial.costPerUnit);
      bomSnapshot.push({ rawMaterialId: l.rawMaterialId, sku: l.rawMaterial.sku, effectiveQty: eff, cost });
      costPrice += cost;
    }
    estimatedMinutes = Math.round((Number(recipe.labourMinutesPerUnit) + Number(recipe.cricutMinutesPerUnit)) * scale);
    if (spec.vaseIncluded) estimatedMinutes += 8;
    if (spec.addGreenery) estimatedMinutes += 5;
    if (spec.domeIncluded) estimatedMinutes += 10;
    if (spec.ledIncluded) estimatedMinutes += 3;
  } else {
    estimatedMinutes = Math.round(22 + stemCount * 6 + (Number(spec.heightMm) / 60));
    if (spec.vaseIncluded) estimatedMinutes += 8;
    if (spec.addGreenery) estimatedMinutes += 5;
    if (spec.domeIncluded) estimatedMinutes += 10;
    if (spec.ledIncluded) estimatedMinutes += 3;
  }

  const addCfg = await getSettings({ onlyPublic: true }).catch(() => ({}));
  const price = (key, d) => { const n = Number(addCfg?.[key]); return addCfg?.[key] != null && addCfg[key] !== '' && Number.isFinite(n) ? n : d; };
  let paperPremiumPerStem = 0;
  if (spec.paperStockId) {
    const paper = await prisma.paperStock.findUnique({ where: { id: spec.paperStockId }, select: { pricePremiumPerStem: true, isActive: true } }).catch(() => null);
    if (paper?.isActive) paperPremiumPerStem = Number(paper.pricePremiumPerStem) || 0;
  }
  const paperPremiumTotal = Math.round(paperPremiumPerStem * stemCount * 100) / 100;

  // Weight / height surcharges (settings-driven, default 0 — behaviour unchanged until set)
  const weightSurcharge = spec.weight === '80lb' ? price('configurator_weight_80lb', 0) : spec.weight === '110lb' ? price('configurator_weight_110lb', 0) : 0;
  const heightExtra = Math.max(0, Number(spec.heightMm) - 400);
  const heightSurcharge = Math.floor(heightExtra / 100) * price('configurator_height_per_100mm', 0);
  const weightHeightTotal = Math.round((weightSurcharge + heightSurcharge) * 100) / 100;

  const cfg = await pricingConfig();
  const LABOUR_RATE = cfg.labourPerHour / 60;
  const rawPrice = costPrice + (estimatedMinutes * LABOUR_RATE);
  const bouquetTotal = Math.round((rawPrice * cfg.margin) * 100) / 100;

  const addOnsTotal = (spec.vaseIncluded ? price('configurator_vase', 22) : 0)
    + (spec.addGreenery ? price('configurator_greenery', 12) : 0)
    + (spec.domeIncluded ? price('configurator_dome', 45) : 0)
    + (spec.ledIncluded ? price('configurator_led', 18) : 0);

  const floorTotal = price('configurator_floor', 45) + stemCount * price('configurator_per_stem', 9.5) + weightHeightTotal;
  const finalPrice = Math.max(floorTotal, bouquetTotal) + addOnsTotal + paperPremiumTotal;

  return {
    total: Math.round(finalPrice * 100) / 100,
    estimatedMinutes,
    bomSnapshot,
    costPrice: Math.round(costPrice * 100) / 100,
    paperPremiumTotal,
    weightHeightTotal,
    addOnsTotal,
    floorTotal,
    bouquetTotal,
  };
}
