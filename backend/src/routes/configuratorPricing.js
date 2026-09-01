import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { costForRecipe, findRecipeFor } from '../services/bomPricing.js';

const router = Router();
const bomLiveLimit = rateLimit('bom_live', 30, 1);

// Public live BOM pricing for configurator (manual sheet costs, $0) — also serves /api/bom/live compat
router.get('/price', bomLiveLimit, asyncHandler(async (req, res) => {
  const { productId, variantId, qty = '1' } = req.query;
  const q = Math.max(1, Math.min(25, parseInt(String(qty), 10) || 1));
  const recipe = await findRecipeFor(prisma, { productId: productId ? String(productId) : null, variantId: variantId ? String(variantId) : null });
  if (!recipe) return res.json({ qty: q, materialsCost: 0, labourMinutes: 25 * q, breakdown: [], note: 'No recipe — fallback estimate' });
  const result = costForRecipe(recipe, q);
  res.json({ qty: q, recipeId: recipe.id, ...result });
}));

// Legacy compat: /api/bom/live
router.get('/live', bomLiveLimit, asyncHandler(async (req, res) => {
  const { productId, variantId, qty = '1' } = req.query;
  const q = Math.max(1, Math.min(25, parseInt(String(qty), 10) || 1));
  const recipe = await findRecipeFor(prisma, { productId: productId ? String(productId) : null, variantId: variantId ? String(variantId) : null });
  if (!recipe) return res.json({ qty: q, materialsCost: 0, labourMinutes: 25 * q, breakdown: [], note: 'No recipe — fallback estimate' });
  const result = costForRecipe(recipe, q);
  res.json({ qty: q, recipeId: recipe.id, ...result });
}));

export default router;
