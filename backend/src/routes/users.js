import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
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

export default router;