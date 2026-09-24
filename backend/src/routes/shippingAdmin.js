import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'developer', 'maker', 'staff'));

const zoneSchema = z.object({
  name: z.string().min(2).max(100),
  postcodes: z.string().max(2000).optional().nullable(), // JSON array or comma-separated
  isActive: z.boolean().optional(),
}).strict();

const rateSchema = z.object({
  name: z.string().min(1).max(100),
  price: z.number().finite().nonnegative().max(1000000),
  freeOver: z.number().finite().nonnegative().max(1000000).optional().nullable(),
  maxWeightGrams: z.number().int().finite().min(0).max(100000000).optional().nullable(),
  isActive: z.boolean().optional(),
}).strict();

// Zones
router.get('/zones', asyncHandler(async (req, res) => {
  const zones = await prisma.shippingZone.findMany({ orderBy: { name: 'asc' }, include: { rates: { orderBy: { name: 'asc' } } } });
  res.json(zones);
}));

router.post('/zones', validate(zoneSchema), asyncHandler(async (req, res) => {
  const zone = await prisma.shippingZone.create({ data: req.validated });
  res.status(201).json(zone);
}));

router.patch('/zones/:id', validate(zoneSchema.partial()), asyncHandler(async (req, res) => {
  const zone = await prisma.shippingZone.update({ where: { id: String(req.params.id).slice(0,100) }, data: req.validated });
  res.json(zone);
}));

router.delete('/zones/:id', asyncHandler(async (req, res) => {
  await prisma.shippingZone.delete({ where: { id: String(req.params.id).slice(0,100) } });
  res.json({ ok: true });
}));

// Rates (nested under a zone)
router.post('/zones/:zoneId/rates', validate(rateSchema), asyncHandler(async (req, res) => {
  const zone = await prisma.shippingZone.findUnique({ where: { id: String(req.params.zoneId).slice(0,100) } });
  if (!zone) return res.status(404).json({ error: 'Zone not found', code: 'not_found' });
  const rate = await prisma.shippingRate.create({ data: { ...req.validated, zoneId: zone.id } });
  res.status(201).json(rate);
}));

router.patch('/rates/:id', validate(rateSchema.partial()), asyncHandler(async (req, res) => {
  const rate = await prisma.shippingRate.update({ where: { id: String(req.params.id).slice(0,100) }, data: req.validated });
  res.json(rate);
}));

router.delete('/rates/:id', asyncHandler(async (req, res) => {
  await prisma.shippingRate.delete({ where: { id: String(req.params.id).slice(0,100) } });
  res.json({ ok: true });
}));

export default router;