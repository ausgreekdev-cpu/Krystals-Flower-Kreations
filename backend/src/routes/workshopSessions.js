import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
const requireAuth = authenticate;

router.post('/:id/sessions', requireAuth, requireRole('admin','developer','maker'), asyncHandler(async (req, res) => {
  const schema = z.object({ startsAt: z.string().min(10).max(50), endsAt: z.string().min(10).max(50), capacity: z.number().int().finite().min(1).max(500).optional() }).strict();
  const data = schema.parse(req.body);
  const session = await prisma.workshopSession.create({ data: { workshopId: req.params.id, startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt), capacity: data.capacity || 12 } });
  res.status(201).json(session);
}));

router.get('/:id/sessions', asyncHandler(async (req, res) => {
  const sessions = await prisma.workshopSession.findMany({ where: { workshopId: req.params.id }, orderBy: { startsAt: 'asc' } });
  res.json(sessions);
}));

export default router;
