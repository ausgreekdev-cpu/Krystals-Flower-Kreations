// Data export (item 7): CSV export for inventory, orders, BOM snapshots, suppliers.
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
router.use(authenticate, requireRole('admin', 'developer', 'maker', 'staff'));

// Helper: convert array of objects to CSV
function toCSV(rows, columns) {
  const header = columns.map((c) => c.label).join(',');
  const body = rows.map((row) =>
    columns.map((c) => {
      const val = c.get(row);
      const str = String(val ?? '');
      // Escape commas, quotes, newlines
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  ).join('\n');
  return header + '\n' + body;
}

// Export inventory levels
router.get('/inventory', asyncHandler(async (req, res) => {
  const levels = await prisma.inventoryLevel.findMany({
    include: { product: { select: { title: true, sku: true } }, location: { select: { name: true } } },
    orderBy: { product: { title: 'asc' } },
  });
  const csv = toCSV(levels, [
    { label: 'Product', get: (r) => r.product?.title },
    { label: 'SKU', get: (r) => r.product?.sku },
    { label: 'Location', get: (r) => r.location?.name },
    { label: 'On Hand', get: (r) => r.onHand },
    { label: 'Low Threshold', get: (r) => r.lowStockThreshold },
    { label: 'Variant ID', get: (r) => r.variantId },
  ]);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="inventory.csv"');
  res.send(csv);
}));

// Export raw materials
router.get('/materials', asyncHandler(async (req, res) => {
  const mats = await prisma.rawMaterial.findMany({ orderBy: { name: 'asc' } });
  const csv = toCSV(mats, [
    { label: 'SKU', get: (r) => r.sku },
    { label: 'Name', get: (r) => r.name },
    { label: 'Unit', get: (r) => r.unit },
    { label: 'On Hand', get: (r) => r.onHand },
    { label: 'Low Threshold', get: (r) => r.lowThreshold },
    { label: 'Cost/Unit', get: (r) => r.costPerUnit },
    { label: 'Supplier', get: (r) => r.supplier },
    { label: 'Status', get: (r) => r.procurementStatus },
    { label: 'Colour', get: (r) => r.colour },
    { label: 'Weight', get: (r) => r.weightValue ? `${r.weightValue}${r.weightUnit}` : '' },
  ]);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="raw-materials.csv"');
  res.send(csv);
}));

// Export orders
router.get('/orders', asyncHandler(async (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const where = status ? { status } : {};
  const orders = await prisma.order.findMany({
    where,
    include: { lines: true, user: { select: { email: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });
  const csv = toCSV(orders, [
    { label: 'Order Number', get: (r) => r.orderNumber },
    { label: 'Status', get: (r) => r.status },
    { label: 'Payment Status', get: (r) => r.paymentStatus },
    { label: 'Customer', get: (r) => r.shippingName || r.email },
    { label: 'Email', get: (r) => r.email },
    { label: 'Subtotal', get: (r) => r.subtotal },
    { label: 'Shipping', get: (r) => r.shippingCost },
    { label: 'Total', get: (r) => r.total },
    { label: 'Payment Method', get: (r) => r.paymentMethod },
    { label: 'Lines', get: (r) => (r.lines || []).map((l) => `${l.quantity}x ${l.title}`).join('; ') },
    { label: 'Created', get: (r) => r.createdAt },
  ]);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
  res.send(csv);
}));

// Export suppliers
router.get('/suppliers', asyncHandler(async (req, res) => {
  const suppliers = await prisma.supplier.findMany({
    include: { _count: { select: { rawMaterials: true, purchaseOrders: true } } },
    orderBy: { name: 'asc' },
  });
  const csv = toCSV(suppliers, [
    { label: 'Name', get: (r) => r.name },
    { label: 'Contact', get: (r) => r.contact },
    { label: 'Email', get: (r) => r.email },
    { label: 'Phone', get: (r) => r.phone },
    { label: 'Website', get: (r) => r.website },
    { label: 'Active', get: (r) => r.isActive },
    { label: 'Materials', get: (r) => r._count?.rawMaterials },
    { label: 'Purchase Orders', get: (r) => r._count?.purchaseOrders },
  ]);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="suppliers.csv"');
  res.send(csv);
}));

export default router;
