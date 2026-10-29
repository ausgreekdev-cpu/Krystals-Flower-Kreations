// Admin: failed side-effect operations (dead-letter queue).
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { audit } from '../lib/audit.js';
import { getFailedSideEffects, retrySideEffect } from '../services/sideEffects.js';

const router = Router();
router.use(authenticate, requireRole('admin', 'developer'));

router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
  const rows = await getFailedSideEffects(limit);
  res.json(rows);
}));

router.post('/:id/retry', asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const result = await retrySideEffect(id);
  if (!result) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'side_effect_retry', entityType: 'audit_log', entityId: id, details: result });
  res.json({ ok: true, ...result });
}));

export default router;
