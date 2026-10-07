import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole, ROLE_RANK, hashPassword } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { audit } from '../lib/audit.js';

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
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'role_change', entityType: 'user', entityId: target.id, details: { fromRole: target.role, toRole: req.validated.role, targetEmail: target.email } });
  res.json({ id: user.id, email: user.email, role: user.role });
}));

// Create a user from the admin Users tab (staff/customer accounts — no self-register)
const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(254),
  password: z.string().min(6).max(128),
  role: z.enum(['customer', 'staff', 'maker', 'admin']),
  phone: z.string().max(30).optional().nullable(),
}).strict();
router.post('/', requireAuth, requireRole('admin', 'developer'), validate(createUserSchema), asyncHandler(async (req, res) => {
  const { name, password, role, phone } = req.validated;
  const email = req.validated.email.trim().toLowerCase();
  // Same rank guard as role changes: only developers may create developer-adjacent
  // accounts — the schema already excludes 'developer' entirely.
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(409).json({ error: 'Email already registered', code: 'conflict' });
  const user = await prisma.user.create({ data: { name: name.slice(0, 100), email, password: await hashPassword(password), role, phone: phone || null } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'user_create', entityType: 'user', entityId: user.id, details: { email, role } });
  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, createdAt: user.createdAt });
}));

// Profile edit — name/email/phone (role has its own guarded route above)
const patchUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().max(254).optional(),
  phone: z.string().max(30).optional().nullable(),
}).strict();
router.patch('/:id', requireAuth, requireRole('admin', 'developer'), validate(patchUserSchema), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const d = req.validated;
  const data = {};
  if (d.name !== undefined) data.name = d.name.slice(0, 100);
  if (d.phone !== undefined) data.phone = d.phone || null;
  if (d.email !== undefined) {
    const email = d.email.trim().toLowerCase();
    if (email !== target.email) {
      const clash = await prisma.user.findUnique({ where: { email } });
      if (clash) return res.status(409).json({ error: 'Email already registered', code: 'conflict' });
    }
    data.email = email;
  }
  try {
    const user = await prisma.user.update({ where: { id }, data });
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'user_update', entityType: 'user', entityId: id, details: { changed: Object.keys(data) } });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Email already registered', code: 'conflict' });
    throw e;
  }
}));

// Shared rank guard for destructive/credential actions on a target user
function forbiddenTarget(req, target) {
  if (target.id === req.user.id) return { status: 400, error: 'Cannot perform this action on your own account', code: 'validation_failed' };
  const callerRank = ROLE_RANK[req.user.role] || 0;
  const targetRank = ROLE_RANK[target.role] || 0;
  if (req.user.role !== 'developer') {
    if (targetRank >= ROLE_RANK.developer) return { status: 403, error: 'Only a developer can modify a developer account', code: 'forbidden' };
    if (callerRank <= targetRank) return { status: 403, error: 'Cannot modify a user with equal or higher rank', code: 'forbidden' };
  }
  return null;
}

// Admin password reset — there is no self-service forgot-password flow, so an
// admin/developer sets a fresh password directly (min 6 like registration).
const resetPasswordSchema = z.object({ password: z.string().min(6).max(128) }).strict();
router.post('/:id/reset-password', requireAuth, requireRole('admin','developer'), validate(resetPasswordSchema), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const guard = forbiddenTarget(req, target);
  if (guard) return res.status(guard.status).json({ error: guard.error, code: guard.code });
  await prisma.user.update({ where: { id }, data: { password: await hashPassword(req.validated.password) } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'user_password_reset', entityType: 'user', entityId: id, details: { targetEmail: target.email } });
  res.json({ ok: true, id: target.id });
}));

// Admin delete — orders/loyalty reference users optionally (SetNull, history is
// keyed by email), but PosSession.openedBy is required: those users can't be deleted.
router.delete('/:id', requireAuth, requireRole('admin','developer'), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const guard = forbiddenTarget(req, target);
  if (guard) return res.status(guard.status).json({ error: guard.error, code: guard.code });
  const posSessions = await prisma.posSession.count({ where: { openedBy: id } });
  if (posSessions > 0) return res.status(409).json({ error: 'User has POS session history and cannot be deleted', code: 'conflict' });
  try {
    await prisma.user.delete({ where: { id } });
  } catch (e) {
    if (e.code === 'P2003') return res.status(409).json({ error: 'User is referenced by records that cannot be removed', code: 'conflict' });
    throw e;
  }
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'user_delete', entityType: 'user', entityId: id, details: { targetEmail: target.email, targetRole: target.role } });
  res.json({ ok: true, id });
}));

export default router;
