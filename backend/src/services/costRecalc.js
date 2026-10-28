// Cost recalculation pipeline (item 4): when a RawMaterial.costPerUnit changes,
// recompute the pricing for all BOMRecipes that use it and flag linked products
// for price review. Best-effort, never blocks the update.
import prisma from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { costForRecipe } from './bomPricing.js';

export async function recalculateRecipeCosts(rawMaterialId, userId = null) {
  // Find all BOM lines referencing this material
  const lines = await prisma.bOMLine.findMany({
    where: { rawMaterialId },
    select: { recipeId: true },
  });
  const recipeIds = [...new Set(lines.map((l) => l.recipeId))];
  if (!recipeIds.length) return [];

  const updated = [];
  for (const recipeId of recipeIds) {
    const recipe = await prisma.bOMRecipe.findUnique({
      where: { id: recipeId },
      include: { lines: { include: { rawMaterial: true } } },
    });
    if (!recipe) continue;

    // Recompute cost
    const est = await costForRecipe(recipe, 7); // 7-stem baseline
    updated.push({ recipeId, materialsCost: est.materialsCost, retail: est.retail });

    // Flag linked product for price review (if product exists)
    if (recipe.productId) {
      await audit({
        actorId: userId,
        action: 'cost_recalc.flagged',
        entityType: 'product',
        entityId: recipe.productId,
        details: { recipeId, materialsCost: est.materialsCost, suggestedRetail: est.retail, reason: 'raw_material_cost_changed' },
      }).catch(() => {});
    }
  }
  return updated;
}
