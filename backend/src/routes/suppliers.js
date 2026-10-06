import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { audit } from '../lib/audit.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'developer', 'maker', 'staff'));

const supplierSchema = z.object({
  name: z.string().min(2).max(120),
  contact: z.string().max(120).optional().nullable(),
  email: z.string().email().max(254).optional().nullable().or(z.literal('').transform(() => null)),
  phone: z.string().max(30).optional().nullable(),
  website: z.string().max(200).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
}).strict();

// Spend/activity stats keyed by supplier id (name fallback for legacy POs that
// predate supplierId). One pass over POs+lines — admin-scale data.
async function supplierStats() {
  const pos = await prisma.purchaseOrder.findMany({
    select: {
      supplierId: true, supplier: true, status: true, createdAt: true,
      lines: { select: { qty: true, unitCost: true } },
    },
  });
  const byId = new Map();
  const byName = new Map();
  for (const po of pos) {
    const spend = po.lines.reduce((t, l) => t + l.qty * Number(l.unitCost || 0), 0);
    const open = po.status !== 'received' && po.status !== 'cancelled';
    const bucketFor = po.supplierId ? byId : byName;
    const key = po.supplierId || String(po.supplier || '').trim().toLowerCase();
    if (!key) continue;
    let s = bucketFor.get(key);
    if (!s) { s = { totalSpend: 0, lastPoAt: null, poCount: 0, openPos: 0 }; bucketFor.set(key, s); }
    s.totalSpend += spend;
    s.poCount += 1;
    if (open) s.openPos += 1;
    if (!s.lastPoAt || new Date(po.createdAt) > new Date(s.lastPoAt)) s.lastPoAt = po.createdAt;
  }
  return (s) => {
    const hit = byId.get(s.id) || byName.get(String(s.name || '').trim().toLowerCase())
      || { totalSpend: 0, lastPoAt: null, poCount: 0, openPos: 0 };
    return { ...hit, totalSpend: Math.round(hit.totalSpend * 100) / 100 };
  };
}

// List with usage counts (materials + purchase orders referencing the supplier)
router.get('/', asyncHandler(async (req, res) => {
  const q = req.query.q ? String(req.query.q).slice(0, 200) : '';
  const where = q ? { name: { contains: q, mode: 'insensitive' } } : {};
  const [suppliers, stats] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { rawMaterials: true, purchaseOrders: true } } },
    }),
    supplierStats(),
  ]);
  res.json(suppliers.map((s) => ({ ...s, stats: stats(s) })));
}));

router.post('/', validate(supplierSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  try {
    const supplier = await prisma.supplier.create({
      data: {
        name: data.name.trim().slice(0, 120),
        contact: data.contact?.trim() || null,
        email: data.email || null,
        phone: data.phone?.trim() || null,
        website: data.website?.trim() || null,
        address: data.address?.trim() || null,
        notes: data.notes?.trim() || null,
        isActive: data.isActive ?? true,
      },
      include: { _count: { select: { rawMaterials: true, purchaseOrders: true } } },
    });
    await audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'supplier.create', entityType: 'supplier', entityId: supplier.id, details: { name: supplier.name } }).catch(() => {});
    res.status(201).json(supplier);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'A supplier with this name already exists', code: 'conflict' });
    throw e;
  }
}));

router.patch('/:id', validate(supplierSchema.partial().strict()), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const d = req.validated;
  try {
    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name.trim().slice(0, 120) } : {}),
        ...(d.contact !== undefined ? { contact: d.contact?.trim() || null } : {}),
        ...(d.email !== undefined ? { email: d.email || null } : {}),
        ...(d.phone !== undefined ? { phone: d.phone?.trim() || null } : {}),
        ...(d.website !== undefined ? { website: d.website?.trim() || null } : {}),
        ...(d.address !== undefined ? { address: d.address?.trim() || null } : {}),
        ...(d.notes !== undefined ? { notes: d.notes?.trim() || null } : {}),
        ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
      },
      include: { _count: { select: { rawMaterials: true, purchaseOrders: true } } },
    });
    await audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'supplier.update', entityType: 'supplier', entityId: supplier.id, details: { name: supplier.name } }).catch(() => {});
    res.json(supplier);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'A supplier with this name already exists', code: 'conflict' });
    throw e;
  }
}));

// Delete: only allowed when unused (FK SetNull would silently orphan links otherwise
// we keep it strict — soft-inactive instead when linked)
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const supplier = await prisma.supplier.findUnique({ where: { id }, include: { _count: { select: { rawMaterials: true, purchaseOrders: true } } } });
  if (!supplier) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  if (supplier._count.rawMaterials > 0 || supplier._count.purchaseOrders > 0) {
    return res.status(409).json({ error: `Supplier is linked to ${supplier._count.rawMaterials} material(s) and ${supplier._count.purchaseOrders} purchase order(s) — deactivate instead`, code: 'conflict' });
  }
  await prisma.supplier.delete({ where: { id } });
  await audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'supplier.delete', entityType: 'supplier', entityId: id, details: { name: supplier.name } }).catch(() => {});
  res.json({ ok: true });
}));

// Materials/POs currently linked to this supplier (for drill-in context)
router.get('/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const [supplier, stats] = await Promise.all([
    prisma.supplier.findUnique({
      where: { id },
      include: {
        _count: { select: { rawMaterials: true, purchaseOrders: true } },
        rawMaterials: { orderBy: { name: 'asc' }, take: 100 },
        purchaseOrders: {
          orderBy: { createdAt: 'desc' }, take: 50,
          include: { lines: { select: { qty: true, unitCost: true } } },
        },
      },
    }),
    supplierStats(),
  ]);
  if (!supplier) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const pos = supplier.purchaseOrders.map((po) => ({
    ...po,
    total: Math.round(po.lines.reduce((t, l) => t + l.qty * Number(l.unitCost || 0), 0) * 100) / 100,
    lines: undefined,
  }));
  res.json({
    ...supplier,
    purchaseOrders: pos,
    stats: stats(supplier),
    lowStock: supplier.rawMaterials.filter((m) => Number(m.onHand) <= Number(m.lowThreshold)).length,
  });
}));

export default router;
