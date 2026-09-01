import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
const requireAuth = authenticate;

const STATE_ORDER = ['drafting_proofing','cricut_cutting','hand_folding_assembly','quality_check','dispatched_pickup_ready'];
function nextState(current, target) {
  if (target === 'cancelled') return true;
  const ci = STATE_ORDER.indexOf(current);
  const ti = STATE_ORDER.indexOf(target);
  return ti === ci + 1 || ti === ci;
}

router.get('/kanban', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const counts = await prisma.customArtOrder.groupBy({ by: ['state'], _count: true, _sum: { totalPrice: true }, where: { state: { not: 'cancelled' } } });
  res.json(counts);
}));

router.patch('/:id/state', requireAuth, requireRole('admin','developer','maker'), asyncHandler(async (req, res) => {
  const { state, note } = req.body;
  const valid = ['drafting_proofing','cricut_cutting','hand_folding_assembly','quality_check','dispatched_pickup_ready','cancelled'];
  if (!valid.includes(state)) return res.status(400).json({ error: 'Invalid state', code: 'validation_failed' });
  const order = await prisma.customArtOrder.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  if (!nextState(order.state, state)) return res.status(409).json({ error: `Cannot move ${order.state} → ${state}`, code: 'conflict' });
  if (order.state === 'drafting_proofing' && state === 'cricut_cutting') {
    for (const line of (order.bomSnapshot || [])) {
      try {
        await prisma.rawMaterial.update({ where: { id: line.rawMaterialId }, data: { onHand: { decrement: line.effectiveQty } } });
        await prisma.stockMovement.create({ data: { productId: order.productId || 'custom', rawMaterialId: line.rawMaterialId, type: 'bom_deduct', quantity: -Math.round(line.effectiveQty), reason: `Custom order ${order.orderNumber} → Cricut Cutting`, reference: order.id, userId: req.user.id } });
      } catch {}
    }
  }
  const updated = await prisma.customArtOrder.update({ where: { id: order.id }, data: { state, ...(state === 'dispatched_pickup_ready' ? { dispatchedAt: new Date() } : {}) } });
  await prisma.customArtOrderHistory.create({ data: { orderId: order.id, fromState: order.state, toState: state, note: note ? String(note).slice(0,500) : null, byUserId: req.user.id } });
  res.json(updated);
}));

export default router;
