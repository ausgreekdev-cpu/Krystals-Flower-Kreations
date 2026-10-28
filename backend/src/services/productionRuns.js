// Batch production pipeline (item 8): group multiple orders for the same
// product into a single production run with a consolidated BOM snapshot.
import prisma from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { buildBOMSnapshot } from './orderBom.js';

// Create a production run for a product, pulling in all unassigned paid/making orders.
export async function createProductionRun(productId, userId = null) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, title: true } });
  if (!product) throw new Error('Product not found');

  // Find orders with this product that aren't already in a run
  const orders = await prisma.order.findMany({
    where: {
      productionRunId: null,
      status: { in: ['paid', 'making'] },
      lines: { some: { productId } },
    },
    include: { lines: true },
  });

  if (!orders.length) return null;

  // Consolidate BOM materials across all orders
  const allLines = [];
  for (const order of orders) {
    for (const line of order.lines) {
      if (line.isDigital || line.productId !== productId) continue;
      allLines.push({ ...line, orderNumber: order.orderNumber });
    }
  }

  // Build consolidated materials map
  const materials = new Map();
  let labourMinutes = 0;
  for (const line of allLines) {
    labourMinutes += 0; // placeholder — would need recipe lookup
  }

  const run = await prisma.productionRun.create({
    data: {
      productId,
      status: 'planned',
      notes: `Auto-created from ${orders.length} order(s)`,
      consolidatedBOM: { orders: orders.map((o) => o.orderNumber), lines: allLines.length, createdAt: new Date().toISOString() },
    },
  });

  // Link orders to the run
  await prisma.order.updateMany({
    where: { id: { in: orders.map((o) => o.id) } },
    data: { productionRunId: run.id },
  });

  await audit({ actorId: userId, action: 'production_run.create', entityType: 'production_run', entityId: run.id, details: { productId, orders: orders.length } }).catch(() => {});
  return run;
}

export async function listProductionRuns(status = null) {
  const where = status ? { status } : {};
  return prisma.productionRun.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { product: { select: { title: true, slug: true } }, _count: { select: { orders: true } } },
  });
}

export async function updateProductionRunStatus(runId, status, userId = null) {
  const valid = ['planned', 'in_progress', 'completed', 'cancelled'];
  if (!valid.includes(status)) throw new Error('Invalid status');
  const run = await prisma.productionRun.update({ where: { id: runId }, data: { status } });
  await audit({ actorId: userId, action: 'production_run.status', entityType: 'production_run', entityId: runId, details: { status } }).catch(() => {});
  return run;
}
