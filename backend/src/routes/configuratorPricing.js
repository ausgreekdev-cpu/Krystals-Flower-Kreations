import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { costForRecipe, findRecipeFor } from '../services/bomPricing.js';
import { quoteCustomOrder } from '../services/customOrderPricing.js';
import { specSchema } from './customOrders.js';

const router = Router();
const bomLiveLimit = rateLimit('bom_live', 30, 1);
const quoteLimit = rateLimit('configurator_quote', 30, 1);

async function handlePrice(req, res) {
  const { productId, variantId, qty = '1' } = req.query;
  const q = Math.max(1, Math.min(25, parseInt(String(qty), 10) || 1));
  const recipe = await findRecipeFor(prisma, { productId: productId ? String(productId) : null, variantId: variantId ? String(variantId) : null });
  if (!recipe) return res.json({ qty: q, materialsCost: 0, labourMinutes: 25 * q, breakdown: [], note: 'No recipe — fallback estimate' });
  const result = await costForRecipe(recipe, q);
  res.json({ qty: q, recipeId: recipe.id, ...result });
}

// Public live BOM pricing for configurator (manual sheet costs, $0) — also serves /api/bom/live compat
router.get('/price', bomLiveLimit, asyncHandler(handlePrice));

// Legacy compat: /api/bom/live
router.get('/live', bomLiveLimit, asyncHandler(handlePrice));

// Public quote — same logic as POST /api/custom-orders, rate-limited
router.post('/quote', quoteLimit, asyncHandler(async (req, res) => {
  const parsed = specSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', code: 'validation_failed', details: parsed.error.flatten() });
  const quoted = await quoteCustomOrder(parsed.data);
  res.json(quoted);
}));

export default router;
