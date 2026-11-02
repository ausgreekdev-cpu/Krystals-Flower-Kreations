import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { audit } from '../lib/audit.js';

const router = Router();
const requireAuth = authenticate;

const pushTokenSchema = z.object({
  token: z.string().min(10).max(256),
  platform: z.enum(['android', 'ios', 'web']).default('android'),
}).strict();

router.post('/push-token', requireAuth, validate(pushTokenSchema), asyncHandler(async (req, res) => {
  const { token, platform } = req.validated;
  const row = await prisma.pushToken.upsert({
    where: { token },
    create: { userId: req.user.id, token, platform },
    update: { userId: req.user.id, platform, updatedAt: new Date() },
  });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'push_token_registered', entityType: 'push_token', entityId: row.id, details: { platform } });
  res.json({ ok: true, id: row.id });
}));

router.get('/home-summary', asyncHandler(async (req, res) => {
  const [featured, announcements, workshops] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true, isFeatured: true, deletedAt: null }, take: 8, orderBy: { createdAt: 'desc' }, include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } } }),
    prisma.setting.findMany({ where: { key: { in: ['announcement_bar_text', 'announcement_bar_enabled'] } } }),
    prisma.workshopSession.findMany({ where: { status: 'open', startsAt: { gte: new Date() } }, take: 5, orderBy: { startsAt: 'asc' }, include: { workshop: true } }),
  ]);
  const settings = Object.fromEntries(announcements.map(s => [s.key, s.value]));
  res.json({ featured, announcement: settings.announcement_bar_enabled === '1' ? settings.announcement_bar_text || null : null, workshops });
}));

router.get('/staff-dashboard', requireAuth, requireRole('staff', 'maker', 'admin', 'developer'), asyncHandler(async (req, res) => {
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date(); end.setHours(23,59,59,999);
  const [posSummary, pendingOrders, lowStock, sessions] = await Promise.all([
    prisma.order.aggregate({ where: { status: 'paid', paymentMethod: { in: ['cash','eftpos','bank_transfer'] }, createdAt: { gte: start, lte: end } }, _count: { _all: true }, _sum: { total: true } }),
    prisma.order.count({ where: { status: { in: ['pending_payment','paid','making','ready'] } } }),
    prisma.inventoryLevel.count({ where: { onHand: { lte: 2 } } }),
    prisma.workshopSession.findMany({ where: { startsAt: { gte: start, lte: end } }, include: { workshop: true, bookings: true } }),
  ]);
  res.json({
    pos: { count: posSummary._count._all, total: Number(posSummary._sum.total || 0) },
    pendingOrders,
    lowStock,
    sessions: sessions.map(s => ({ id: s.id, title: s.workshop.title, startsAt: s.startsAt, booked: s.bookedCount, capacity: s.capacity, attendance: s.bookings.filter(b => b.status === 'attended').length })),
  });
}));

export default router;