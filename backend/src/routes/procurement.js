// Procurement workflow (item 6): draft RawMaterials auto-created during
// procedure-import approval land here as 'draft' with a suggested supplier.
// Reviewers approve (creating/linking a Supplier profile) or reject.
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { audit } from '../lib/audit.js';
import { replenishLowStock } from '../services/replenishment.js';

const router = Router();
const EDITOR_ROLES = ['admin', 'developer', 'maker', 'staff'];

router.use(authenticate, requireRole(...EDITOR_ROLES));

// List draft materials (pending procurement approval)
router.get('/drafts', asyncHandler(async (req, res) => {
  const rows = await prisma.rawMaterial.findMany({
    where: { procurementStatus: 'draft' },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  // Suggest matching existing suppliers
  const supplierNames = [...new Set(rows.map((r) => r.suggestedSupplier).filter(Boolean))];
  const suppliers = supplierNames.length
    ? await prisma.supplier.findMany({
        where: { name: { in: supplierNames } },
        select: { id: true, name: true },
      })
    : [];
  const supplierMap = new Map(suppliers.map((s) => [s.name.toLowerCase(), s]));
  res.json(rows.map((r) => ({
    ...r,
    suggestedSupplierMatch: r.suggestedSupplier ? (supplierMap.get(r.suggestedSupplier.toLowerCase()) || null) : null,
  })));
}));

const approveSchema = z.object({
  supplierId: z.string().min(1).max(100).optional().nullable(),
  supplierName: z.string().min(2).max(120).optional(),
  createSupplier: z.boolean().default(false),
}).strict();

// Approve a draft material: link/create supplier, set status to active
router.post('/:id/approve', validate(approveSchema), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const mat = await prisma.rawMaterial.findUnique({ where: { id } });
  if (!mat) return res.status(404).json({ error: 'Material not found', code: 'not_found' });
  if (mat.procurementStatus !== 'draft') {
    return res.status(409).json({ error: 'Material is not a draft', code: 'not_draft' });
  }

  const { supplierId, supplierName, createSupplier } = req.validated;
  let resolvedSupplierId = supplierId || null;
  const name = supplierName || mat.suggestedSupplier;

  if (!resolvedSupplierId && name) {
    // Try to find existing supplier by name
    const existing = await prisma.supplier.findUnique({ where: { name } });
    if (existing) {
      resolvedSupplierId = existing.id;
    } else if (createSupplier) {
      // Create new supplier profile
      const created = await prisma.supplier.create({
        data: { name: name.trim().slice(0, 120), isActive: true },
      });
      resolvedSupplierId = created.id;
      await audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'supplier.create', entityType: 'supplier', entityId: created.id, details: { name: created.name, via: 'procurement' } }).catch(() => {});
    }
  }

  const updated = await prisma.rawMaterial.update({
    where: { id },
    data: {
      procurementStatus: 'active',
      supplierId: resolvedSupplierId,
      supplier: name || mat.supplier,
    },
  });
  await audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'procurement.approve', entityType: 'raw_material', entityId: id, details: { supplierId: resolvedSupplierId, supplierName: name } }).catch(() => {});
  res.json(updated);
}));

// Reject a draft material (soft: mark inactive, or delete)
router.post('/:id/reject', asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const mat = await prisma.rawMaterial.findUnique({ where: { id } });
  if (!mat) return res.status(404).json({ error: 'Material not found', code: 'not_found' });
  if (mat.procurementStatus !== 'draft') {
    return res.status(409).json({ error: 'Material is not a draft', code: 'not_draft' });
  }
  // Hard-delete draft materials (they were never used in inventory)
  await prisma.rawMaterial.delete({ where: { id } });
  await audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'procurement.reject', entityType: 'raw_material', entityId: id, details: { name: mat.name } }).catch(() => {});
  res.json({ ok: true, deleted: true });
}));

// Manually trigger replenishment (creates draft POs for all low-stock materials)
router.post('/replenish', asyncHandler(async (req, res) => {
  const pos = await replenishLowStock(req.user.id);
  res.json({ created: pos.length, purchaseOrders: pos });
}));

export default router;