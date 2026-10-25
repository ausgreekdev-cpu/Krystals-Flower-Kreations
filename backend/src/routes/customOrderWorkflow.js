import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { handleCustomOrderStateChange } from '../lib/customOrderState.js';

const router = Router();
const requireAuth = authenticate;

router.get('/kanban', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const counts = await prisma.customArtOrder.groupBy({ by: ['state'], _count: true, _sum: { totalPrice: true }, where: { state: { not: 'cancelled' } } });
  res.json(counts);
}));

router.patch('/:id/state', requireAuth, requireRole('admin','developer','maker'), asyncHandler(async (req, res) => {
  const { state, note } = req.body;
  const updated = await handleCustomOrderStateChange({ orderId: req.params.id, targetState: state, note, actorId: req.user.id });
  res.json(updated);
}));

export default router;
