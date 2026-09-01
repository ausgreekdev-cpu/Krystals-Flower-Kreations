import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
const requireAuth = authenticate;

router.get('/', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const recipes = await prisma.bOMRecipe.findMany({ include: { product: { select: { title: true, slug: true } }, variant: true, lines: { include: { rawMaterial: true } } } });
  res.json(recipes);
}));

const recipeSchema = z.object({
  productId: z.string().min(8).max(100).optional().nullable(),
  variantId: z.string().min(8).max(100).optional().nullable(),
  labourMinutesPerUnit: z.number().finite().nonnegative().max(10000).default(25),
  cricutMinutesPerUnit: z.number().finite().nonnegative().max(10000).default(8),
  lines: z.array(z.object({
    rawMaterialId: z.string().min(8).max(100),
    qtyPerUnit: z.number().finite().positive().max(10000),
    wasteFactor: z.number().finite().min(0).max(1).default(0.05),
  })).min(1).max(50),
}).strict().refine(d => d.productId || d.variantId, { message: 'productId or variantId required' });

router.post('/', requireAuth, requireRole('admin','developer','maker','staff'), validate(recipeSchema), asyncHandler(async (req, res) => {
  const { productId, variantId, labourMinutesPerUnit, cricutMinutesPerUnit, lines } = req.validated;
  const existing = await prisma.bOMRecipe.findFirst({ where: { productId: productId || null, variantId: variantId || null } });
  if (existing) await prisma.bOMLine.deleteMany({ where: { recipeId: existing.id } });
  const recipe = existing
    ? await prisma.bOMRecipe.update({ where: { id: existing.id }, data: { labourMinutesPerUnit, cricutMinutesPerUnit } })
    : await prisma.bOMRecipe.create({ data: { productId: productId || null, variantId: variantId || null, labourMinutesPerUnit, cricutMinutesPerUnit } });
  for (const l of lines) {
    await prisma.bOMLine.create({ data: { recipeId: recipe.id, rawMaterialId: l.rawMaterialId, qtyPerUnit: l.qtyPerUnit, wasteFactor: l.wasteFactor } });
  }
  const full = await prisma.bOMRecipe.findUnique({ where: { id: recipe.id }, include: { lines: { include: { rawMaterial: true } } } });
  res.status(201).json(full);
}));

router.delete('/:id', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0,100);
  await prisma.bOMRecipe.delete({ where: { id } });
  res.json({ ok: true });
}));

router.get('/:id/estimate', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const qty = Math.max(1, Math.min(100, parseInt(String(req.query.qty), 10) || 1));
  const id = String(req.params.id).slice(0,100);
  const recipe = await prisma.bOMRecipe.findUnique({ where: { id }, include: { lines: { include: { rawMaterial: true } } } });
  if (!recipe) return res.status(404).json({ error: 'Recipe not found', code: 'not_found' });
  let materialsCost = 0;
  const breakdown = recipe.lines.map(l => {
    const eff = l.qtyPerUnit * (1 + l.wasteFactor) * qty;
    const cost = eff * l.rawMaterial.costPerUnit;
    materialsCost += cost;
    return { sku: l.rawMaterial.sku, name: l.rawMaterial.name, unit: l.rawMaterial.unit, perUnit: l.qtyPerUnit, wasteFactor: l.wasteFactor, effectiveQty: eff, cost };
  });
  const labourMinutes = (recipe.labourMinutesPerUnit + recipe.cricutMinutesPerUnit) * qty;
  res.json({ qty, materialsCost, labourMinutes, breakdown });
}));

export default router;
