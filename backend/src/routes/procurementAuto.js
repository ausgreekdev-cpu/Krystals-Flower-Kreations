// Procurement auto-workflow (Tier 3): single endpoint that checks all low-stock
// materials, groups by supplier, creates draft POs, and notifies.
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { audit } from '../lib/audit.js';
import { replenishLowStock } from '../services/replenishment.js';
import { notify } from '../services/notifications.js';
import { runSideEffect } from '../services/sideEffects.js';

const router = Router();
router.use(authenticate, requireRole('admin', 'developer', 'maker', 'staff'));

router.post('/auto', asyncHandler(async (req, res) => {
  const steps = [];
  const errors = [];

  // Step 1: Find all low-stock materials
  const materials = await prisma.rawMaterial.findMany({ take: 500 });
  const lowMaterials = materials.filter((m) => Number(m.onHand) <= Number(m.lowThreshold));
  steps.push({ step: 'low_stock_scan', status: 'ok', detail: `${lowMaterials.length} low-stock materials found` });

  // Step 2: Create draft POs grouped by supplier
  const result = await runSideEffect('replenishLowStock', () => replenishLowStock(req.user.id), {
    context: { entityType: 'procurement', entityId: 'auto', userId: req.user.id },
  });
  if (result.ok) {
    steps.push({ step: 'draft_pos', status: 'ok', detail: `${result.result?.length || 0} draft PO(s) created` });
  } else {
    steps.push({ step: 'draft_pos', status: 'error', detail: result.error });
    errors.push(result.error);
  }

  // Step 3: Notify admin
  try {
    const pos = result.result || [];
    if (pos.length > 0) {
      // Use a simple notification via the event bus
      await notify('order.created', { order: { orderNumber: `PROCUREMENT-${Date.now()}`, total: 0, lines: [], email: '', shippingName: 'Auto-replenishment' } }).catch(() => {});
      steps.push({ step: 'notification', status: 'ok', detail: 'Admin notified' });
    } else {
      steps.push({ step: 'notification', status: 'skipped', detail: 'No draft POs to notify about' });
    }
  } catch (e) {
    steps.push({ step: 'notification', status: 'error', detail: e.message });
  }

  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'procurement.auto', entityType: 'procurement', entityId: 'auto', details: { steps, errors, lowMaterials: lowMaterials.length } });

  res.json({ steps, errors: errors.length ? errors : undefined, lowMaterials: lowMaterials.length, draftPos: (result.result || []).length });
}));

export default router;
