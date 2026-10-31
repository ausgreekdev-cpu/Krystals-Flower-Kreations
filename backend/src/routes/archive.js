// Data archival (item 7): archive old records to keep the DB lean.
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { audit } from '../lib/audit.js';

const router = Router();
router.use(authenticate, requireRole('admin', 'developer'));

const VALID_TYPES = ['orders', 'stock_movements', 'audit_logs'];

router.post('/', asyncHandler(async (req, res) => {
  const types = Array.isArray(req.body?.types) ? req.body.types : VALID_TYPES;
  const olderThanDays = Math.max(30, parseInt(String(req.body?.olderThanDays || '90'), 10));
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  const results = {};
  for (const type of types) {
    if (!VALID_TYPES.includes(type)) continue;
    let count = 0;
    if (type === 'orders') {
      const r = await prisma.order.updateMany({
        where: { status: { in: ['delivered', 'cancelled', 'refunded'] }, createdAt: { lt: cutoff }, archivedAt: null },
        data: { archivedAt: new Date() },
      });
      count = r.count;
    } else if (type === 'stock_movements') {
      const r = await prisma.stockMovement.updateMany({
        where: { createdAt: { lt: cutoff }, archivedAt: null },
        data: { archivedAt: new Date() },
      });
      count = r.count;
    } else if (type === 'audit_logs') {
      const r = await prisma.auditLog.updateMany({
        where: { createdAt: { lt: cutoff }, archivedAt: null, action: { not: 'side_effect_failed' } },
        data: { archivedAt: new Date() },
      });
      count = r.count;
    }
    results[type] = count;
  }

  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'data_archive', entityType: 'system', entityId: 'archive', details: { types, olderThanDays, results } });
  res.json({ ok: true, cutoff: cutoff.toISOString(), results });
}));

// List archived counts
router.get('/stats', asyncHandler(async (req, res) => {
  const [orders, movements, audits] = await Promise.all([
    prisma.order.count({ where: { archivedAt: { not: null } } }),
    prisma.stockMovement.count({ where: { archivedAt: { not: null } } }),
    prisma.auditLog.count({ where: { archivedAt: { not: null } } }),
  ]);
  const total = await Promise.all([
    prisma.order.count(),
    prisma.stockMovement.count(),
    prisma.auditLog.count(),
  ]);
  res.json({
    archived: { orders, movements, audits },
    total: { orders: total[0], movements: total[1], audits: total[2] },
  });
}));

export default router;
