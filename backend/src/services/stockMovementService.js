import prisma from '../lib/prisma.js';

export async function recordMovement(txOrPrisma, { productId, variantId, locationId, rawMaterialId, type, quantity, reason, reference, userId }) {
  const p = txOrPrisma || prisma;
  if (!Number.isFinite(quantity) || quantity === 0) throw new Error('quantity must be finite non-zero');
  return p.stockMovement.create({
    data: {
      productId: productId || 'raw',
      variantId: variantId || null,
      locationId: locationId || null,
      rawMaterialId: rawMaterialId || null,
      type: String(type).slice(0, 50),
      quantity,
      reason: reason ? String(reason).slice(0, 500) : null,
      reference: reference ? String(reference).slice(0, 100) : null,
      userId: userId || null,
    },
  });
}

export async function decrementVariant(tx, variantId, qty, userId, reason, orderId) {
  const upd = await tx.productVariant.updateMany({ where: { id: variantId, inventoryQuantity: { gte: qty } }, data: { inventoryQuantity: { decrement: qty } } });
  if (upd.count === 0) {
    const v = await tx.productVariant.findUnique({ where: { id: variantId } });
    const err = new Error(`Insufficient stock for ${v?.title}: only ${v?.inventoryQuantity ?? 0} left`);
    err.status = 422; err.code = 'out_of_stock';
    throw err;
  }
  await tx.inventoryLedger.create({ data: { variantId, delta: -qty, reason: String(reason).slice(0, 50), orderId: orderId || null, userId: userId || null } });
  return true;
}
