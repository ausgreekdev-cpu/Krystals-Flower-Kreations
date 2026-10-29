// Unified order fulfillment workflow (Tier 3): single endpoint that
// orchestrates the full production lifecycle for an order.
//
// POST /:id/fulfill checks BOM → allocates stock → creates production run →
// triggers QC. Each step is best-effort and logged.
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { audit } from '../lib/audit.js';
import { notify } from '../services/notifications.js';
import { runSideEffect } from '../services/sideEffects.js';
import { consumeOrderMaterials } from '../services/orderBom.js';
import { createProductionRun } from '../services/productionRuns.js';

const router = Router();
router.use(authenticate, requireRole('admin', 'developer', 'maker', 'staff'));

router.post('/:id/fulfill', asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const order = await prisma.order.findUnique({ where: { id }, include: { lines: true } });
  if (!order) return res.status(404).json({ error: 'Order not found', code: 'not_found' });

  const steps = [];
  const errors = [];

  // Step 1: Check BOM recipes exist for all lines
  const { findRecipeFor } = await import('../services/bomPricing.js');
  const missingRecipes = [];
  for (const line of order.lines) {
    if (line.isDigital) continue;
    const recipe = await findRecipeFor(prisma, { productId: line.productId, variantId: line.variantId });
    if (!recipe) missingRecipes.push(line.title);
  }
  if (missingRecipes.length) {
    steps.push({ step: 'bom_check', status: 'warning', detail: `Missing recipes for: ${missingRecipes.join(', ')}` });
  } else {
    steps.push({ step: 'bom_check', status: 'ok', detail: 'All lines have BOM recipes' });
  }

  // Step 2: Consume stock (if not already consumed)
  if (!order.bomSnapshot) {
    const result = await runSideEffect('consumeOrderMaterials', () => consumeOrderMaterials(order), {
      critical: true, context: { entityType: 'order', entityId: order.id, userId: req.user.id },
    });
    if (result.ok) {
      steps.push({ step: 'stock_consumption', status: 'ok', detail: 'Raw materials decremented' });
    } else {
      steps.push({ step: 'stock_consumption', status: 'error', detail: result.error });
      errors.push(result.error);
    }
  } else {
    steps.push({ step: 'stock_consumption', status: 'skipped', detail: 'Already consumed (bomSnapshot exists)' });
  }

  // Step 3: Generate BOM snapshot (if not already)
  if (!order.bomSnapshot) {
    try {
      const { generateOrderBOM } = await import('../services/orderBom.js');
      await generateOrderBOM(order);
      steps.push({ step: 'bom_snapshot', status: 'ok', detail: 'BOM snapshot generated' });
    } catch (e) {
      steps.push({ step: 'bom_snapshot', status: 'error', detail: e.message });
      errors.push(e.message);
    }
  } else {
    steps.push({ step: 'bom_snapshot', status: 'skipped', detail: 'Already generated' });
  }

  // Step 4: Create production run (if product exists and no run assigned)
  if (order.productionRunId) {
    steps.push({ step: 'production_run', status: 'skipped', detail: 'Already assigned to a run' });
  } else {
    const productIds = [...new Set(order.lines.filter((l) => !l.isDigital).map((l) => l.productId))];
    if (productIds.length === 1) {
      try {
        const run = await createProductionRun(productIds[0], req.user.id);
        if (run) {
          await prisma.order.update({ where: { id: order.id }, data: { productionRunId: run.id } });
          steps.push({ step: 'production_run', status: 'ok', detail: `Created run ${run.id}` });
        } else {
          steps.push({ step: 'production_run', status: 'skipped', detail: 'No eligible orders for run' });
        }
      } catch (e) {
        steps.push({ step: 'production_run', status: 'error', detail: e.message });
        errors.push(e.message);
      }
    } else {
      steps.push({ step: 'production_run', status: 'skipped', detail: 'Multiple products — manual run creation required' });
    }
  }

  // Step 5: Set QC to pending
  if (!order.qcStatus) {
    await prisma.order.update({ where: { id }, data: { qcStatus: 'pending' } }).catch(() => {});
    steps.push({ step: 'qc_init', status: 'ok', detail: 'QC status set to pending' });
  } else {
    steps.push({ step: 'qc_init', status: 'skipped', detail: `QC already ${order.qcStatus}` });
  }

  // Step 6: Move order to 'making' if currently 'paid'
  if (order.status === 'paid') {
    await prisma.order.update({ where: { id }, data: { status: 'making' } });
    await prisma.orderStatusHistory.create({ data: { orderId: id, fromStatus: 'paid', toStatus: 'making', note: 'Auto-fulfilled' } }).catch(() => {});
    steps.push({ step: 'status_transition', status: 'ok', detail: 'paid → making' });
  } else {
    steps.push({ step: 'status_transition', status: 'skipped', detail: `Already ${order.status}` });
  }

  // Step 7: Notify
  await notify('order.status_changed', { order, fromStatus: order.status, toStatus: 'making' }).catch(() => {});
  steps.push({ step: 'notification', status: 'ok', detail: 'Status update sent' });

  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'order_fulfill', entityType: 'order', entityId: id, details: { steps, errors } });

  res.json({ order: await prisma.order.findUnique({ where: { id } }), steps, errors: errors.length ? errors : undefined });
}));

export default router;
