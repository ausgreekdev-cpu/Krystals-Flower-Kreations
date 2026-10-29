// Studio health dashboard (Tier 4): aggregates all operational KPIs + alerts + trends.
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
router.use(authenticate, requireRole('admin', 'developer', 'maker', 'staff'));

router.get('/', asyncHandler(async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalOrders, todayOrders, weekOrders, monthOrders,
    pendingPayment, paid, making, ready, shipped, delivered, cancelled,
    totalRevenue, todayRevenue, weekRevenue, monthRevenue,
    lowStockMaterials, lowStockLevels,
    pendingQc, pendingProcurement, activeRuns,
    failedSideEffects, totalProducts, totalCustomers,
    recentOrders,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.order.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.order.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.order.count({ where: { status: 'pending_payment' } }),
    prisma.order.count({ where: { status: 'paid' } }),
    prisma.order.count({ where: { status: 'making' } }),
    prisma.order.count({ where: { status: 'ready' } }),
    prisma.order.count({ where: { status: 'shipped' } }),
    prisma.order.count({ where: { status: 'delivered' } }),
    prisma.order.count({ where: { status: 'cancelled' } }),
    prisma.order.aggregate({ _sum: { total: true } }).then((r) => Number(r._sum.total || 0)),
    prisma.order.aggregate({ where: { createdAt: { gte: todayStart } }, _sum: { total: true } }).then((r) => Number(r._sum.total || 0)),
    prisma.order.aggregate({ where: { createdAt: { gte: weekStart } }, _sum: { total: true } }).then((r) => Number(r._sum.total || 0)),
    prisma.order.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { total: true } }).then((r) => Number(r._sum.total || 0)),
    prisma.rawMaterial.count({ where: { onHand: { lte: 0 } } }).catch(() => 0),
    prisma.inventoryLevel.count().catch(() => 0),
    prisma.order.count({ where: { qcStatus: 'pending' } }).catch(() => 0),
    prisma.rawMaterial.count({ where: { procurementStatus: 'draft' } }).catch(() => 0),
    prisma.productionRun.count({ where: { status: { in: ['planned', 'in_progress'] } } }).catch(() => 0),
    prisma.auditLog.count({ where: { action: 'side_effect_failed' } }).catch(() => 0),
    prisma.product.count({ where: { deletedAt: null, isActive: true } }).catch(() => 0),
    prisma.user.count({ where: { role: 'customer' } }).catch(() => 0),
    prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, orderNumber: true, status: true, total: true, createdAt: true, shippingName: true } }).catch(() => []),
  ]);

  // Low stock (materials below threshold)
  const allMaterials = await prisma.rawMaterial.findMany({ select: { onHand: true, lowThreshold: true } });
  const lowStock = allMaterials.filter((m) => Number(m.onHand) <= Number(m.lowThreshold)).length;

  // Alerts
  const alerts = [];
  if (lowStock > 0) alerts.push({ type: 'low_stock', severity: 'warning', message: `${lowStock} material(s) below threshold` });
  if (pendingQc > 0) alerts.push({ type: 'pending_qc', severity: 'info', message: `${pendingQc} order(s) pending QC` });
  if (pendingProcurement > 0) alerts.push({ type: 'pending_procurement', severity: 'info', message: `${pendingProcurement} material(s) pending procurement approval` });
  if (failedSideEffects > 0) alerts.push({ type: 'failed_side_effects', severity: 'error', message: `${failedSideEffects} failed side effect(s) need attention` });
  if (paid > 5) alerts.push({ type: 'backlog', severity: 'warning', message: `${paid} orders awaiting production` });

  // Stale orders (stuck in a status for > 7 days)
  const staleCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const staleOrders = await prisma.order.count({
    where: { status: { in: ['pending_payment', 'paid', 'making'] }, updatedAt: { lt: staleCutoff } },
  }).catch(() => 0);
  if (staleOrders > 0) alerts.push({ type: 'stale_orders', severity: 'warning', message: `${staleOrders} order(s) stuck for >7 days` });

  res.json({
    orders: {
      total: totalOrders,
      today: todayOrders,
      week: weekOrders,
      month: monthOrders,
      byStatus: { pendingPayment, paid, making, ready, shipped, delivered, cancelled },
    },
    revenue: {
      total: Math.round(totalRevenue * 100) / 100,
      today: Math.round(todayRevenue * 100) / 100,
      week: Math.round(weekRevenue * 100) / 100,
      month: Math.round(monthRevenue * 100) / 100,
    },
    inventory: { lowStock, totalLevels: lowStockLevels },
    operations: { pendingQc, pendingProcurement, activeRuns },
    catalog: { activeProducts: totalProducts },
    customers: { total: totalCustomers },
    alerts,
    recentOrders,
    generatedAt: now.toISOString(),
  });
}));

export default router;
