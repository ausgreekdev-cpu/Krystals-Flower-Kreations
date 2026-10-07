import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'developer', 'maker', 'staff'));

// Resolve supplier free-text → Supplier id (same rules as materials)
async function linkSupplierByName(name) {
  const n = String(name).trim().slice(0, 120);
  if (!n) return null;
  const s = await prisma.supplier.findFirst({ where: { name: { equals: n, mode: 'insensitive' } }, select: { id: true } });
  return s?.id || null;
}

const lineSchema = z.object({
  rawMaterialId: z.string().min(8).max(100).optional().nullable(),
  productId: z.string().min(8).max(100).optional().nullable(),
  variantId: z.string().min(8).max(100).optional().nullable(),
  qty: z.number().int().finite().min(1).max(1000000),
  unitCost: z.number().finite().nonnegative().max(1000000).optional().nullable(),
}).strict();

const poSchema = z.object({
  supplier: z.string().min(2).max(200),
  supplierId: z.string().min(8).max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(lineSchema).min(1).max(100),
}).strict();

// Edit — supplier/notes/lines before receiving (received POs are immutable)
const poPatchSchema = z.object({
  supplier: z.string().min(2).max(200).optional(),
  supplierId: z.string().min(8).max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(lineSchema).min(1).max(100).optional(),
}).strict();

router.get('/', asyncHandler(async (req, res) => {
  const pos = await prisma.purchaseOrder.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { lines: true, _count: { select: { lines: true } }, supplierRef: { select: { id: true, name: true } } } });
  res.json(pos);
}));

router.post('/', validate(poSchema), asyncHandler(async (req, res) => {
  const { supplier, supplierId, notes, lines } = req.validated;
  const poNumber = `PO-${Date.now().toString().slice(-8)}`;
  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber, supplier, supplierId: supplierId || await linkSupplierByName(supplier), notes: notes || null, createdBy: req.user.id, status: 'ordered',
      lines: { create: lines.map(l => ({ ...l, unitCost: l.unitCost ?? undefined })) },
    },
    include: { lines: true },
  });
  res.status(201).json(po);
}));

// Edit — replace supplier/notes/lines while the PO hasn't been received
router.patch('/:id', validate(poPatchSchema), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
  if (!po) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  if (po.status === 'received') return res.status(409).json({ error: 'Received purchase orders cannot be edited', code: 'conflict' });
  const d = req.validated;
  // Supplier text changed without an explicit id → re-link by name
  if (d.supplier !== undefined && d.supplierId === undefined) d.supplierId = await linkSupplierByName(d.supplier);
  const updated = await prisma.$transaction(async (tx) => {
    if (d.lines) {
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      await tx.purchaseOrderLine.createMany({ data: d.lines.map(l => ({ purchaseOrderId: id, ...l, unitCost: l.unitCost ?? undefined })) });
    }
    return tx.purchaseOrder.update({
      where: { id },
      data: {
        ...(d.supplier !== undefined ? { supplier: d.supplier } : {}),
        ...(d.supplierId !== undefined ? { supplierId: d.supplierId || null } : {}),
        ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
      },
      include: { lines: true },
    });
  });
  res.json(updated);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: String(req.params.id).slice(0,100) }, include: { supplierRef: { select: { id: true, name: true } }, lines: { include: { rawMaterial: { select: { name: true, sku: true, unit: true } }, product: { select: { title: true } }, variant: { select: { title: true } } } } } });
  if (!po) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  res.json(po);
}));

// Receive: mark ordered stock as received (updates stock + movements with po reference)
router.post('/:id/receive', asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0,100);
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
  if (!po) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const location = await prisma.inventoryLocation.findFirst({ where: { isDefault: true } }) || await prisma.inventoryLocation.findFirst();
  const locId = location?.id;
  await prisma.$transaction(async (tx) => {
    for (const l of po.lines) {
      const remaining = l.qty - l.receivedQty;
      if (remaining <= 0) continue;
      if (l.rawMaterialId) {
        await tx.rawMaterial.update({ where: { id: l.rawMaterialId }, data: { onHand: { increment: remaining } } });
        await tx.stockMovement.create({ data: { rawMaterialId: l.rawMaterialId, locationId: locId, type: 'po', quantity: remaining, reason: `PO ${po.poNumber} received`, reference: po.id, userId: req.user.id } });
      } else {
        const vId = l.variantId || null;
        const level = await tx.inventoryLevel.findFirst({ where: { productId: l.productId, variantId: vId, locationId: locId } });
        if (level) await tx.inventoryLevel.update({ where: { id: level.id }, data: { onHand: { increment: remaining } } });
        else await tx.inventoryLevel.create({ data: { productId: l.productId, variantId: vId, locationId: locId, onHand: remaining } });
        if (vId) await tx.productVariant.update({ where: { id: vId }, data: { inventoryQuantity: { increment: remaining } } });
        await tx.stockMovement.create({ data: { productId: l.productId, variantId: vId, locationId: locId, type: 'po', quantity: remaining, reason: `PO ${po.poNumber} received`, reference: po.id, userId: req.user.id } });
      }
      await tx.purchaseOrderLine.update({ where: { id: l.id }, data: { receivedQty: l.receivedQty + remaining } });
    }
    const allReceived = (await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } })).every(l => l.receivedQty >= l.qty);
    await tx.purchaseOrder.update({ where: { id }, data: { status: allReceived ? 'received' : 'partial', receivedAt: new Date() } });
  });
  res.json({ ok: true, received: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0,100);
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  if (po.status !== 'ordered') return res.status(409).json({ error: 'Partially or fully received purchase orders cannot be deleted — they already changed stock', code: 'conflict' });
  await prisma.purchaseOrder.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;