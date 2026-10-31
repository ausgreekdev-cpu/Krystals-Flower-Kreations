// Admin: failed side-effect operations (dead-letter queue).
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { audit } from '../lib/audit.js';
import { getFailedSideEffects, retrySideEffect } from '../services/sideEffects.js';
import { recentEvents, registeredEvents } from '../services/eventBus.js';
import { executeSideEffect, isRetryable } from '../services/sideEffectRegistry.js';

const router = Router();
router.use(authenticate, requireRole('admin', 'developer'));

router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
  const rows = await getFailedSideEffects(limit);
  res.json(rows);
}));

// List retryable operation names
router.get('/retryable', asyncHandler(async (req, res) => {
  const { getRetryableOps } = await import('../services/sideEffectRegistry.js');
  res.json(getRetryableOps());
}));

router.post('/:id/retry', asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const row = await prisma.auditLog.findUnique({ where: { id } });
  if (!row || row.action !== 'side_effect_failed') return res.status(404).json({ error: 'Not found', code: 'not_found' });

  const { name, context } = row.details || {};
  if (!name || !isRetryable(name)) {
    return res.status(400).json({ error: `Side effect "${name}" is not retryable`, code: 'not_retryable' });
  }

  // Execute the side effect
  let result = null;
  let error = null;
  try {
    result = await executeSideEffect(name, context || {});
  } catch (e) {
    error = e?.message || String(e);
  }

  // Update the audit log
  await prisma.auditLog.update({
    where: { id },
    data: {
      action: error ? 'side_effect_retry_failed' : 'side_effect_retried',
      details: { ...row.details, retriedAt: new Date().toISOString(), retryResult: error ? { error } : { ok: true, result: result ? 'success' : null } },
    },
  });

  audit({ actorId: req.user.id, actorEmail: req.user.email, action: error ? 'side_effect_retry_failed' : 'side_effect_retry', entityType: 'audit_log', entityId: id, details: { name, error } });

  if (error) return res.status(500).json({ error, code: 'retry_failed' });
  res.json({ ok: true, name, result });
}));

// Event bus monitoring
router.get('/events', asyncHandler(async (req, res) => {
  res.json({ recent: recentEvents(20), registered: registeredEvents() });
}));

export default router;
