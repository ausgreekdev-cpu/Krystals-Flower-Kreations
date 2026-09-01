import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();

router.patch('/:id/status', authenticate, asyncHandler(async (req, res) => {
  if (!['admin','developer','maker','staff'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
  const { status, note } = req.body;
  if (!status || typeof status !== 'string' || status.length > 50) return res.status(400).json({ error: 'Invalid status', code: 'validation_failed' });
  const current = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const order = await prisma.order.update({ where: { id: req.params.id }, data: { status, paymentStatus: status==='paid' ? 'paid' : undefined } });
  await prisma.orderStatusHistory.create({ data: { orderId: order.id, fromStatus: current.status, toStatus: status, note: note ? String(note).slice(0,500) : null } });
  if (status === 'paid' && current.status !== 'paid') {
    try {
      const pts = Math.floor(Number(order.total));
      if (pts>0) {
        let acc = await prisma.loyaltyAccount.findUnique({ where:{ email: order.email } });
        if(!acc) acc = await prisma.loyaltyAccount.create({ data:{ email: order.email, points:0, tier:'seedling' } });
        const newPoints = acc.points + pts;
        const tier = newPoints>=500?'garden': newPoints>=100?'blossom':'seedling';
        await prisma.loyaltyAccount.update({ where:{ id:acc.id }, data:{ points:newPoints, tier } });
        await prisma.loyaltyTransaction.create({ data:{ accountId:acc.id, pointsDelta:pts, reason:'purchase', orderId:order.id } });
      }
    } catch {}
  }
  res.json(order);
}));

export default router;
