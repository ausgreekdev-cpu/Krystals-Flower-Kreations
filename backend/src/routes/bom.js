import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { costForRecipe } from '../services/bomPricing.js';

const router = Router();
const requireAuth = authenticate;

// All BOM routes require maker+ (raw materials are studio internals) — live pricing can be public for configurator
const bomLiveLimit = rateLimit('bom_live', 30, 1);

// ── Raw Materials ──────────────────────────

router.get('/materials', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const materials = await prisma.rawMaterial.findMany({ orderBy: { name: 'asc' } });
  res.json(materials);
}));

router.get('/low-stock', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const all = await prisma.rawMaterial.findMany();
  const low = all.filter(m => m.onHand <= m.lowThreshold);
  res.json(low);
}));

// Public live BOM pricing for configurator (manual sheet costs, no supplier API fees) — $0
router.get('/live', bomLiveLimit, asyncHandler(async (req, res) => {
  const { productId, variantId, qty = '1' } = req.query;
  const q = Math.max(1, Math.min(25, parseInt(String(qty), 10) || 1));
  let recipe = null;
  if (variantId) recipe = await prisma.bOMRecipe.findFirst({ where: { variantId: String(variantId) }, include: { lines: { include: { rawMaterial: true } } } });
  if (!recipe && productId) recipe = await prisma.bOMRecipe.findFirst({ where: { productId: String(productId), variantId: null }, include: { lines: { include: { rawMaterial: true } } } });
  if (!recipe) recipe = await prisma.bOMRecipe.findFirst({ include: { lines: { include: { rawMaterial: true } } } });
  if (!recipe) return res.json({ qty: q, materialsCost: 0, labourMinutes: 25*q, breakdown: [], note: 'No recipe — fallback estimate' });
  const result = await costForRecipe(recipe, q);
  res.json({ qty: q, recipeId: recipe.id, ...result });
}));

const materialSchema = z.object({
  sku: z.string().min(2).max(50),
  name: z.string().min(2).max(200),
  unit: z.enum(['sheet','meter','stick','roll','piece','ml','gram']).default('sheet'),
  onHand: z.number().nonnegative().default(0),
  lowThreshold: z.number().nonnegative().default(5),
  costPerUnit: z.number().nonnegative().default(0),
  supplier: z.string().optional().nullable(),
  locationId: z.string().optional().nullable(),
});

router.post('/materials', requireAuth, requireRole('admin','developer','maker','staff'), validate(materialSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  const mat = await prisma.rawMaterial.upsert({
    where: { sku: data.sku },
    update: { ...data },
    create: { ...data },
  });
  res.status(201).json(mat);
}));

router.patch('/materials/:id', requireAuth, requireRole('admin','developer','maker','staff'), validate(materialSchema.partial().strict()), asyncHandler(async (req, res) => {
  const mat = await prisma.rawMaterial.update({ where: { id: req.params.id }, data: req.validated });
  res.json(mat);
}));

router.post('/materials/:id/adjust', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const { qty, reason } = req.body; // qty positive = in, negative = out
  if (typeof qty !== 'number' || !Number.isFinite(qty)) return res.status(400).json({ error: 'qty must be finite number', code: 'validation_failed' });
  const mat = await prisma.rawMaterial.update({ where: { id: req.params.id }, data: { onHand: { increment: qty } } });
  await prisma.stockMovement.create({
    data: {
      rawMaterialId: mat.id,
      type: qty >= 0 ? 'in' : 'out',
      quantity: qty,
      reason: String(reason || 'manual adjustment').slice(0,500),
      userId: req.user.id,
    },
  });
  res.json(mat);
}));

// ── BOM Recipes ────────────────────────────

router.get('/recipes', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const recipes = await prisma.bOMRecipe.findMany({ include: { product: { select: { title: true, slug: true } }, variant: true, lines: { include: { rawMaterial: true } } } });
  res.json(recipes);
}));

const recipeBaseSchema = z.object({
  productId: z.string().optional().nullable(),
  variantId: z.string().optional().nullable(),
  labourMinutesPerUnit: z.number().nonnegative().default(25),
  cricutMinutesPerUnit: z.number().nonnegative().default(8),
  lines: z.array(z.object({
    rawMaterialId: z.string(),
    qtyPerUnit: z.number().positive(),
    wasteFactor: z.number().min(0).max(1).default(0.05),
  })).min(1),
});
const recipeSchema = recipeBaseSchema.refine(d => d.productId || d.variantId, { message: 'productId or variantId required' });
const recipePatchSchema = recipeBaseSchema.partial().refine(d => !('lines' in d) || (d.lines && d.lines.length > 0), { message: 'lines must not be empty' });

router.post('/recipes', requireAuth, requireRole('admin','developer','maker','staff'), validate(recipeSchema), asyncHandler(async (req, res) => {
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

// Single recipe with full lines (for the editor)
router.get('/recipes/:id', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const recipe = await prisma.bOMRecipe.findUnique({
    where: { id: String(req.params.id).slice(0,100) },
    include: { product: { select: { title: true, slug: true } }, variant: true, lines: { include: { rawMaterial: true }, orderBy: { id: 'asc' } } },
  });
  if (!recipe) return res.status(404).json({ error: 'Recipe not found', code: 'not_found' });
  res.json(recipe);
}));

// Partial update — labour/cricut minutes and/or full line replacement
router.patch('/recipes/:id', requireAuth, requireRole('admin','developer','maker','staff'), validate(recipePatchSchema), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0,100);
  const existing = await prisma.bOMRecipe.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Recipe not found', code: 'not_found' });
  const { lines, ...rest } = req.validated;
  await prisma.bOMRecipe.update({ where: { id }, data: rest });
  if (lines) {
    await prisma.bOMLine.deleteMany({ where: { recipeId: id } });
    for (const l of lines) {
      await prisma.bOMLine.create({ data: { recipeId: id, rawMaterialId: l.rawMaterialId, qtyPerUnit: l.qtyPerUnit, wasteFactor: l.wasteFactor } });
    }
  }
  const full = await prisma.bOMRecipe.findUnique({ where: { id }, include: { product: { select: { title: true } }, variant: true, lines: { include: { rawMaterial: true } } } });
  res.json(full);
}));

router.delete('/recipes/:id', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  await prisma.bOMRecipe.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// Preview: calculate cost + time for a recipe at qty
router.get('/recipes/:id/estimate', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const qty = Math.max(1, Math.min(100, parseInt(String(req.query.qty), 10) || 1));
  const recipe = await prisma.bOMRecipe.findUnique({ where: { id: req.params.id }, include: { lines: { include: { rawMaterial: true } } } });
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
