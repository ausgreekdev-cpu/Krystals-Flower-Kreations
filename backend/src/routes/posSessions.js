import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
const requireAuth = authenticate;
router.use(requireAuth, requireRole('admin','developer','maker','staff'));

const openSchema = z.object({ location: z.string().max(100).optional(), openingCash: z.number().finite().nonnegative().max(10000).default(0) }).strict();
router.post('/open', validate(openSchema), asyncHandler(async (req, res) => {
  const { location, openingCash } = req.validated;
  const session = await prisma.posSession.create({ data: { openedBy: req.user.id, location: location || 'Perth Studio', openingCash: openingCash || 0 } });
  res.status(201).json(session);
}));

router.get('/current', asyncHandler(async (req, res) => {
  const session = await prisma.posSession.findFirst({ where: { status: 'open' }, orderBy: { openedAt: 'desc' }, include: { payments: true } });
  res.json(session);
}));

const closeSchema = z.object({ closingCash: z.number().finite().nonnegative().max(100000) }).strict();
router.post('/:id/close', validate(closeSchema), asyncHandler(async (req, res) => {
  const { closingCash } = req.validated;
  const session = await prisma.posSession.findUnique({ where: { id: req.params.id }, include: { payments: true } });
  if (!session) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const cashPayments = session.payments.filter(p => p.method === 'cash').reduce((a,b)=> a + Number(b.amount), 0);
  const expectedCash = Number(session.openingCash) + cashPayments;
  const variance = Number(closingCash) - expectedCash;
  const updated = await prisma.posSession.update({ where: { id: session.id }, data: { closedAt: new Date(), closingCash, expectedCash, variance, status: 'closed' } });
  res.json(updated);
}));

export default router;
