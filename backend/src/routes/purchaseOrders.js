import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'developer', 'maker', 'staff'));

const lineSchema = z.object({
  rawMaterialId: z.string().min(8).max(100).optional().nullable(),
  productId: z.string().min(8).max(100).optional().nullable(),
  variantId: z.string().min(8).max(100).optional().nullable(),
  qty: z.number().int().finite().min(1).max(1000000),
  unitCost: z.number().finite().nonnegative().max(1000000).optional().nullable(),
}).strict();

const poSchema = z.object({
  supplier: z.string().min(2).max(200),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(lineSchema).min(1).max(100),
}).strict();

router.get('/', asyncHandler(async (req, res) => {
  const pos = await prisma.purchaseOrder.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { lines: true, _count: { select: { lines: true } } } });
  res.json(pos);
}));

router.post('/', validate(poSchema), asyncHandler(async (req, res) => {
  const { supplier, notes, lines } = req.validated;
  const poNumber = `PO-${Date.now().toString().slice(-8)}`;
  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber, supplier, notes: notes || null, createdBy: req.user.id, status: 'ordered',
      lines: { create: lines.map(l => ({ ...l, unitCost: l.unitCost ?? undefined })) },
    },
    include: { lines: true },
  });
  res.status(201).json(po);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: String(req.params.id).slice(0,100) }, include: { lines: { include: { rawMaterial: { select: { name: true, sku: true, unit: true } }, product: { select: { title: true } }, variant: { select: { title: true } } } } } });
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
  await prisma.purchaseOrder.delete({ where: { id: String(req.params.id).slice(0,100) } });
  res.json({ ok: true });
}));

export default router;