import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// All BOM routes require maker+ (raw materials are studio internals)
router.use(requireAuth, requireRole('admin','developer','maker','staff'));

// ── Raw Materials ──────────────────────────

router.get('/materials', async (req, res) => {
  const materials = await prisma.rawMaterial.findMany({ orderBy: { name: 'asc' } });
  res.json(materials);
});

router.get('/low-stock', async (req, res) => {
  // raw on_hand <= low_threshold
  const all = await prisma.rawMaterial.findMany();
  const low = all.filter(m => m.onHand <= m.lowThreshold);
  res.json(low);
});

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

router.post('/materials', validate(materialSchema), async (req, res) => {
  const data = req.validated;
  const mat = await prisma.rawMaterial.upsert({
    where: { sku: data.sku },
    update: { ...data },
    create: { ...data },
  });
  res.status(201).json(mat);
});

router.patch('/materials/:id', async (req, res) => {
  const mat = await prisma.rawMaterial.update({ where: { id: req.params.id }, data: req.body });
  res.json(mat);
});

router.post('/materials/:id/adjust', async (req, res) => {
  const { qty, reason } = req.body; // qty positive = in, negative = out
  const mat = await prisma.rawMaterial.update({ where: { id: req.params.id }, data: { onHand: { increment: qty } } });
  await prisma.stockMovement.create({
    data: {
      productId: 'raw',
      rawMaterialId: mat.id,
      type: qty >= 0 ? 'in' : 'out',
      quantity: qty,
      reason: reason || 'manual adjustment',
      userId: req.user.id,
    },
  });
  res.json(mat);
});

// ── BOM Recipes ────────────────────────────

router.get('/recipes', async (req, res) => {
  const recipes = await prisma.bOMRecipe.findMany({ include: { product: { select: { title: true, slug: true } }, variant: true, lines: { include: { rawMaterial: true } } } });
  res.json(recipes);
});

const recipeSchema = z.object({
  productId: z.string().optional().nullable(),
  variantId: z.string().optional().nullable(),
  labourMinutesPerUnit: z.number().nonnegative().default(25),
  cricutMinutesPerUnit: z.number().nonnegative().default(8),
  lines: z.array(z.object({
    rawMaterialId: z.string(),
    qtyPerUnit: z.number().positive(),
    wasteFactor: z.number().min(0).max(1).default(0.05),
  })).min(1),
}).refine(d => d.productId || d.variantId, { message: 'productId or variantId required' });

router.post('/recipes', validate(recipeSchema), async (req, res) => {
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
});

router.delete('/recipes/:id', async (req, res) => {
  await prisma.bOMRecipe.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// Preview: calculate cost + time for a recipe at qty
router.get('/recipes/:id/estimate', async (req, res) => {
  const qty = Math.max(1, parseInt(req.query.qty, 10) || 1);
  const recipe = await prisma.bOMRecipe.findUnique({ where: { id: req.params.id }, include: { lines: { include: { rawMaterial: true } } } });
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  let materialsCost = 0;
  const breakdown = recipe.lines.map(l => {
    const eff = l.qtyPerUnit * (1 + l.wasteFactor) * qty;
    const cost = eff * l.rawMaterial.costPerUnit;
    materialsCost += cost;
    return { sku: l.rawMaterial.sku, name: l.rawMaterial.name, unit: l.rawMaterial.unit, perUnit: l.qtyPerUnit, wasteFactor: l.wasteFactor, effectiveQty: eff, cost };
  });
  const labourMinutes = (recipe.labourMinutesPerUnit + recipe.cricutMinutesPerUnit) * qty;
  res.json({ qty, materialsCost, labourMinutes, breakdown });
});

export default router;
