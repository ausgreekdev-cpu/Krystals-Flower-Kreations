// Admin metrics endpoint.
import { Router } from 'express';
import { authenticate, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { getMetrics, resetMetrics } from '../services/metrics.js';

const router = Router();
router.use(authenticate, requireRole('admin', 'developer'));

router.get('/', asyncHandler(async (req, res) => {
  res.json(getMetrics());
}));

router.post('/reset', asyncHandler(async (req, res) => {
  resetMetrics();
  res.json({ ok: true });
}));

export default router;
