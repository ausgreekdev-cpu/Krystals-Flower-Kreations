import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole, ROLE_RANK } from '../lib/auth.js';
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

// Customer list — role=customer only, with order count + spend + loyalty points
router.get('/customers', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const q = req.query.q ? String(req.query.q).slice(0,200) : '';
  const where = { role: 'customer' };
  if (q) where.OR = [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }];
  const customers = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, email: true, name: true, phone: true, createdAt: true,
      loyaltyAccount: { select: { points: true, tier: true } },
    },
  });
  const emails = customers.map(c => c.email);
  const orderAgg = await prisma.order.groupBy({ by: ['email'], _count: { _all: true }, _sum: { total: true }, where: { email: { in: emails } } });
  const aggMap = Object.fromEntries(orderAgg.map(a => [a.email, { count: a._count._all, total: a._sum.total || 0 }]));
  res.json(customers.map(c => ({
    id: c.id, email: c.email, name: c.name, phone: c.phone, createdAt: c.createdAt,
    orders: aggMap[c.email]?.count || 0, spend: Number(aggMap[c.email]?.total || 0),
    points: c.loyaltyAccount?.points || 0, tier: c.loyaltyAccount?.tier || 'seedling',
  })));
}));

// Customer detail — profile + orders + bookings + custom art orders + loyalty transactions
router.get('/:id', requireAuth, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0,100);
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const [orders, bookings, customOrders, loyalty] = await Promise.all([
    prisma.order.findMany({ where: { OR: [{ email: user.email }, { userId: user.id }] }, orderBy: { createdAt: 'desc' }, take: 100, include: { lines: true } }),
    prisma.booking.findMany({ where: { OR: [{ email: user.email }, { userId: user.id }] }, orderBy: { createdAt: 'desc' }, take: 50, include: { session: { include: { workshop: { select: { title: true } } } } } }),
    prisma.customArtOrder.findMany({ where: { customerEmail: user.email }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.loyaltyAccount.findUnique({ where: { email: user.email }, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 50 } } }),
  ]);
  res.json({ ...user, orders, bookings, customOrders, loyalty });
}));

// Role management — admin/developer can promote/demote (cannot change own role).
// Guard: only developers may grant/revoke the developer role (prevents privilege
// escalation by admins), and no one can modify a developer unless they're one.
const roleSchema = z.object({ role: z.enum(['customer','staff','maker','admin','developer']) }).strict();
router.patch('/:id/role', requireAuth, requireRole('admin','developer'), validate(roleSchema), asyncHandler(async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot change your own role', code: 'validation_failed' });
  const callerRank = ROLE_RANK[req.user.role] || 0;
  const targetRank = ROLE_RANK[target.role] || 0;
  const newRank = ROLE_RANK[req.validated.role] || 0;
  const callerIsDev = req.user.role === 'developer';
  if (!callerIsDev) {
    if (newRank >= ROLE_RANK.developer) {
      return res.status(403).json({ error: 'Only a developer can assign the developer role', code: 'forbidden' });
    }
    if (targetRank >= ROLE_RANK.developer) {
      return res.status(403).json({ error: 'Only a developer can modify a developer account', code: 'forbidden' });
    }
    if (callerRank <= targetRank) {
      return res.status(403).json({ error: 'Cannot change the role of a user with equal or higher rank', code: 'forbidden' });
    }
  }
  const user = await prisma.user.update({ where: { id: target.id }, data: { role: req.validated.role } });
  // Structured audit log (persistent AuditLog table lands with a later change)
  console.log(JSON.stringify({ level: 'info', event: 'role_change', byUserId: req.user.id, byEmail: req.user.email, targetUserId: target.id, targetEmail: target.email, fromRole: target.role, toRole: req.validated.role, at: new Date().toISOString() }));
  res.json({ id: user.id, email: user.email, role: user.role });
}));

export default router;