import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { registerFieldRoutes, validateCustomFields, customFieldsSchema } from '../lib/fieldDefs.js';

const router = Router();
const requireAuth = authenticate;

router.get('/', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const materials = await prisma.rawMaterial.findMany({ orderBy: { name: 'asc' } });
  res.json(materials);
}));

router.get('/low-stock', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const all = await prisma.rawMaterial.findMany({ orderBy: { name: 'asc' } });
  const low = all.filter(m => m.onHand <= m.lowThreshold);
  res.json(low);
}));

// Admin-defined custom fields for materials — staff-only list (internal data)
registerFieldRoutes(router, { entityType: 'material', roles: ['admin', 'developer'], publicList: false });

const materialSchema = z.object({
  sku: z.string().min(2).max(50),
  barcode: z.string().trim().max(50).optional().nullable(), // scan label for stocktakes
  name: z.string().min(2).max(200),
  unit: z.enum(['sheet','meter','stick','roll','piece','ml','gram']).default('sheet'),
  onHand: z.number().finite().nonnegative().max(1000000).default(0),
  lowThreshold: z.number().finite().nonnegative().max(1000000).default(5),
  costPerUnit: z.number().finite().nonnegative().max(1000000).default(0),
  supplier: z.string().max(200).optional().nullable(),
  brand: z.string().trim().max(80).optional().nullable(),
  weightValue: z.number().finite().nonnegative().max(10000).optional().nullable(),
  weightUnit: z.enum(['lb', 'gsm']).optional().nullable(),
  colour: z.string().trim().max(60).optional().nullable(),
  size: z.string().trim().max(40).optional().nullable(),
  customFields: customFieldsSchema,
  locationId: z.string().min(8).max(100).optional().nullable(),
}).strict();

router.post('/', requireAuth, requireRole('admin','developer','maker','staff'), validate(materialSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  data.customFields = await validateCustomFields(data.customFields, 'material');
  if (data.customFields === null) data.customFields = Prisma.DbNull; // clear = DB NULL, not JSON 'null'
  try {
    const mat = await prisma.rawMaterial.upsert({ where: { sku: data.sku }, update: { ...data }, create: { ...data } });
    res.status(201).json(mat);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Barcode already in use', code: 'barcode_taken' });
    throw e;
  }
}));

router.patch('/:id', requireAuth, requireRole('admin','developer','maker','staff'), validate(materialSchema.partial().strict()), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0,100);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const data = req.validated;
  if (data.customFields !== undefined) data.customFields = await validateCustomFields(data.customFields, 'material');
  if (data.customFields === null) data.customFields = Prisma.DbNull; // clear = DB NULL, not JSON 'null'
  try {
    const mat = await prisma.rawMaterial.update({ where: { id }, data });
    res.json(mat);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Barcode already in use', code: 'barcode_taken' });
    throw e;
  }
}));

router.post('/:id/adjust', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const { qty, reason } = req.body;
  if (typeof qty !== 'number' || !Number.isFinite(qty)) return res.status(400).json({ error: 'qty must be finite number', code: 'validation_failed' });
  const id = String(req.params.id).slice(0,100);
  const mat = await prisma.rawMaterial.update({ where: { id }, data: { onHand: { increment: qty } } });
  await prisma.stockMovement.create({ data: { rawMaterialId: mat.id, type: qty >= 0 ? 'in' : 'out', quantity: qty, reason: String(reason || 'manual adjustment').slice(0,500), userId: req.user.id } });
  res.json(mat);
}));

// Exact-set onHand for a raw material
router.post('/:id/set', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const { onHand, reason } = req.body;
  if (typeof onHand !== 'number' || !Number.isFinite(onHand) || onHand < 0) return res.status(400).json({ error: 'onHand must be a non-negative finite number', code: 'validation_failed' });
  const id = String(req.params.id).slice(0,100);
  const mat = await prisma.rawMaterial.findUnique({ where: { id } });
  if (!mat) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const delta = onHand - Number(mat.onHand);
  const updated = await prisma.rawMaterial.update({ where: { id }, data: { onHand } });
  if (delta !== 0) {
    await prisma.stockMovement.create({ data: { rawMaterialId: id, type: delta > 0 ? 'in' : 'out', quantity: delta, reason: `Set to ${onHand}${reason ? ` — ${reason}` : ''}`, userId: req.user.id } });
  }
  res.json(updated);
}));

router.delete('/:id', requireAuth, requireRole('admin','developer'), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0,100);
  await prisma.rawMaterial.delete({ where: { id } });
  res.json({ ok: true });
}));

// Detail endpoint — last so literal paths above (fields, low-stock) win
router.get('/:id', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0,100);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const material = await prisma.rawMaterial.findUnique({ where: { id } });
  if (!material) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  res.json(material);
}));

export default router;
