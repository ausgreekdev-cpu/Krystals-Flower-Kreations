import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
const ADMIN = ['admin', 'developer'];

router.get('/', authenticate, requireRole(...ADMIN), asyncHandler(async (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const entries = await prisma.dLQEntry.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { automation: { select: { id: true, name: true } } },
  });
  res.json(entries);
}));

router.post('/:id/retry', authenticate, requireRole(...ADMIN), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const entry = await prisma.dLQEntry.findUnique({ where: { id } });
  if (!entry) return res.status(404).json({ error: 'DLQ entry not found', code: 'not_found' });
  const updated = await prisma.dLQEntry.update({
    where: { id },
    data: { status: 'retrying', attempts: entry.attempts + 1, nextRetryAt: new Date(Date.now() + 60000) },
  });
  res.json(updated);
}));

router.post('/:id/discard', authenticate, requireRole(...ADMIN), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const updated = await prisma.dLQEntry.update({
    where: { id },
    data: { status: 'discarded', resolvedAt: new Date() },
  });
  res.json(updated);
}));

export default router;
