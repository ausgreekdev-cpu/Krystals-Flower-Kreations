import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { createProductionRun, listProductionRuns, updateProductionRunStatus } from '../services/productionRuns.js';

const router = Router();
router.use(authenticate, requireRole('admin', 'developer', 'maker', 'staff'));

router.get('/', asyncHandler(async (req, res) => {
  const status = req.query.status ? String(req.query.status) : null;
  const runs = await listProductionRuns(status);
  res.json(runs);
}));

router.post('/', asyncHandler(async (req, res) => {
  const productId = String(req.body?.productId || '').trim();
  if (!productId) return res.status(400).json({ error: 'productId required', code: 'validation_failed' });
  const run = await createProductionRun(productId, req.user.id);
  if (!run) return res.status(404).json({ error: 'No eligible orders for this product', code: 'not_found' });
  res.status(201).json(run);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const status = String(req.body?.status || '').trim();
  if (!status) return res.status(400).json({ error: 'status required', code: 'validation_failed' });
  try {
    const run = await updateProductionRunStatus(id, status, req.user.id);
    res.json(run);
  } catch (e) {
    res.status(400).json({ error: e.message, code: 'validation_failed' });
  }
}));

export default router;
