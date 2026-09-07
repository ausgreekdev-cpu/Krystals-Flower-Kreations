import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { rateLimit } from '../middleware/rate-limit.js';

const router = Router();
const validateLimit = rateLimit('discount_validate', 20, 1);

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
