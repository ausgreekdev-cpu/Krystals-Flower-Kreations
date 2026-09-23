import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();

// Staff-facing user list for the Admin "Users" tab (auth-gated; no passwords leaked)
router.get('/', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, phone: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json(users);
}));

// Role management — admin/developer can promote/demote (cannot change own role)
const roleSchema = z.object({ role: z.enum(['customer','staff','maker','admin','developer']) }).strict();
router.patch('/:id/role', requireAuth, requireRole('admin','developer'), validate(roleSchema), asyncHandler(async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot change your own role', code: 'validation_failed' });
  const user = await prisma.user.update({ where: { id: target.id }, data: { role: req.validated.role } });
  res.json({ id: user.id, email: user.email, role: user.role });
}));

export default router;