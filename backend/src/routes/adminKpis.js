// Admin dashboard KPIs — single endpoint aggregating operational counts.
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
router.use(authenticate, requireRole('admin', 'developer', 'maker', 'staff'));

router.get('/kpis', asyncHandler(async (req, res) => {
  const defaultThreshold = Number((await prisma.setting.findUnique({ where: { key: 'low_stock_default' } }))?.value || 5);

  const [lowStockMaterials, lowStockLevels, pendingQc, pendingProcurement, activeRuns, totalOrders, totalProducts] = await Promise.all([
    prisma.rawMaterial.count({ where: { onHand: { lte: 0 } } }).catch(() => 0),
    prisma.inventoryLevel.count({ where: { onHand: { lte: defaultThreshold } } }).catch(() => 0),
    prisma.order.count({ where: { qcStatus: 'pending' } }).catch(() => 0),
    prisma.rawMaterial.count({ where: { procurementStatus: 'draft' } }).catch(() => 0),
    prisma.productionRun.count({ where: { status: { in: ['planned', 'in_progress'] } } }).catch(() => 0),
    prisma.order.count({ where: { status: { in: ['pending_payment', 'paid', 'making'] } } }).catch(() => 0),
    prisma.product.count({ where: { deletedAt: null, isActive: true } }).catch(() => 0),
  ]);

  const lowStock = (await prisma.rawMaterial.findMany({ select: { onHand: true, lowThreshold: true } }))
    .filter((m) => Number(m.onHand) <= Number(m.lowThreshold)).length + lowStockLevels;

  res.json({
    lowStock,
    pendingQc,
    pendingProcurement,
    activeRuns,
    openOrders: totalOrders,
    activeProducts: totalProducts,
  });
}));

export default router;
