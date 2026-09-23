import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { rateLimit } from '../middleware/rate-limit.js';

const router = Router();
const validateLimit = rateLimit('discount_validate', 20, 1);

// Admin CRUD (staff+) — separate router mount keeps public /validate unauthenticated
const admin = Router();
admin.use(requireAuth, requireRole('admin', 'developer', 'maker', 'staff'));

admin.get('/', asyncHandler(async (req, res) => {
  const discounts = await prisma.discount.findMany({ orderBy: { code: 'asc' } });
  res.json(discounts);
}));

const discountSchema = z.object({
  code: z.string().min(2).max(30).transform((s) => s.toUpperCase()),
  description: z.string().max(500).optional().nullable(),
  type: z.enum(['percent', 'fixed']),
  value: z.number().finite().nonnegative().max(1000000),
  minSpend: z.number().finite().nonnegative().max(1000000).optional().nullable(),
  maxUses: z.number().int().finite().min(0).max(10000000).optional().nullable(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
}).strict();

admin.post('/', validate(discountSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  const existing = await prisma.discount.findUnique({ where: { code: data.code } });
  if (existing) return res.status(409).json({ error: 'Code already exists', code: 'conflict' });
  const disc = await prisma.discount.create({
    data: {
      ...data,
      minSpend: data.minSpend ?? undefined, maxUses: data.maxUses ?? undefined,
      startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
      endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
    },
  });
  res.status(201).json(disc);
}));

admin.patch('/:id', validate(discountSchema.partial().strict()), asyncHandler(async (req, res) => {
  const data = req.validated;
  const disc = await prisma.discount.update({
    where: { id: req.params.id },
    data: {
      ...data,
      minSpend: data.minSpend === null ? null : data.minSpend,
      maxUses: data.maxUses === null ? null : data.maxUses,
      startsAt: data.startsAt === null ? null : data.startsAt ? new Date(data.startsAt) : undefined,
      endsAt: data.endsAt === null ? null : data.endsAt ? new Date(data.endsAt) : undefined,
    },
  });
  res.json(disc);
}));

admin.delete('/:id', asyncHandler(async (req, res) => {
  await prisma.discount.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// Live validate for checkout — debounce from frontend
router.get('/validate', validateLimit, asyncHandler(async (req, res) => {
  const code = String(req.query.code || '').trim().toUpperCase().slice(0,30);
  if (!code) return res.json({ valid: false, error: 'No code' });
  const disc = await prisma.discount.findUnique({ where: { code } });
  if (!disc) return res.json({ valid: false, error: 'Invalid code' });
  if (!disc.isActive) return res.json({ valid: false, error: 'Inactive' });
  const now = new Date();
  if (disc.startsAt && now < new Date(disc.startsAt)) return res.json({ valid: false, error: `Starts ${new Date(disc.startsAt).toLocaleDateString()}` });
  if (disc.endsAt && now > new Date(disc.endsAt)) return res.json({ valid: false, error: 'Expired' });
  if (disc.maxUses && disc.usedCount >= disc.maxUses) return res.json({ valid: false, error: 'Max uses reached' });
  // minSpend check requires subtotal — frontend passes ?code=&subtotal= — optional
  const subtotal = parseFloat(String(req.query.subtotal||'0'));
  if (disc.minSpend && subtotal < Number(disc.minSpend)) return res.json({ valid: false, error: `Min spend $${Number(disc.minSpend).toFixed(2)}` });
  res.json({ valid: true, discount: { code: disc.code, type: disc.type, value: Number(disc.value), description: disc.description } });
}));

export default router;

export { admin as adminDiscountsRouter };
