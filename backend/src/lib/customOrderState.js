import prisma from './prisma.js';

export const STATE_ORDER = ['drafting_proofing','cricut_cutting','hand_folding_assembly','quality_check','dispatched_pickup_ready'];

export function nextState(current, target) {
  if (target === 'cancelled') return true;
  const ci = STATE_ORDER.indexOf(current);
  const ti = STATE_ORDER.indexOf(target);
  return ti === ci + 1 || ti === ci;
}

// Shared handler — both /api/custom-orders/:id/state and /api/custom-orders/workflow/:id/state use it
export async function handleCustomOrderStateChange({ orderId, targetState, note, actorId }) {
  const valid = [...STATE_ORDER, 'cancelled'];
  if (!valid.includes(targetState)) {
    const err = new Error('Invalid state');
    err.status = 400; err.code = 'validation_failed'; err.expose = true;
    throw err;
  }
  const order = await prisma.customArtOrder.findUnique({ where: { id: orderId } });
  if (!order) {
    const err = new Error('Not found');
    err.status = 404; err.code = 'not_found'; err.expose = true;
    throw err;
  }
  if (!nextState(order.state, targetState)) {
    const err = new Error(`Cannot move ${order.state} → ${targetState}`);
    err.status = 409; err.code = 'conflict'; err.expose = true;
    throw err;
  }

  // Wrap stock (de)allocation in one transaction — no empty catches, surface errors
  // PgBouncer note: uses sequential ops inside interactive transaction only for this state change;
  // keep it small (few writes) to avoid pooler issues. If prod pooler rejects it, surface 503.
  if (order.state === 'drafting_proofing' && targetState === 'cricut_cutting') {
    if (!order.bomSnapshot || !Array.isArray(order.bomSnapshot) || order.bomSnapshot.length === 0) {
      // No recipe — nothing to deduct, just move state with note
    } else {
      await prisma.$transaction(async (tx) => {
        for (const line of order.bomSnapshot) {
          const qty = Number(line.effectiveQty);
          if (!Number.isFinite(qty) || qty <= 0) continue;
          const dec = Math.round(qty * 100) / 100; // keep 2dp for Float onHand
          // Decrement and check stock — StockMovement quantity is Int, so log rounded
          const mat = await tx.rawMaterial.findUnique({ where: { id: line.rawMaterialId } });
          if (!mat) throw Object.assign(new Error(`Raw material ${line.rawMaterialId} not found`), { status: 409, code: 'out_of_stock', expose: true });
          if (Number(mat.onHand) < dec) throw Object.assign(new Error(`Insufficient stock for ${mat.name}`), { status: 409, code: 'out_of_stock', expose: true });
          await tx.rawMaterial.update({ where: { id: line.rawMaterialId }, data: { onHand: { decrement: dec } } });
          await tx.stockMovement.create({ data: {
            rawMaterialId: line.rawMaterialId,
            type: 'bom_deduct',
            quantity: -Math.round(dec), // Int — rounded to match onHand decrement (see schema: quantity Int vs onHand Float)
            reason: `Custom order ${order.orderNumber} → Cutting`,
            reference: order.id,
            userId: actorId,
          }});
        }
        const paperId = order.spec && typeof order.spec === 'object' ? order.spec.paperStockId : null;
        if (paperId) {
          const paper = await tx.paperStock.findUnique({ where: { id: paperId } });
          if (paper) {
            const dec = Number(order.spec.stemCount) || 1;
            if (Number(paper.onHand) < dec) throw Object.assign(new Error(`Insufficient paper stock for ${paper.name}`), { status: 409, code: 'out_of_stock', expose: true });
            await tx.paperStock.update({ where: { id: paperId }, data: { onHand: { decrement: dec } } });
          }
        }
      });
    }
  }

  // Restock on cancel after deduction (reverse movements)
  if (targetState === 'cancelled' && order.state !== 'drafting_proofing' && order.state !== 'cancelled') {
    // Only restock if we previously deducted (i.e. order had bomSnapshot and was beyond drafting)
    // Check if there are dedup movements for this order to avoid double-restock
    const existingDedcuts = await prisma.stockMovement.findMany({ where: { reference: order.id, type: 'bom_deduct' } });
    if (existingDedcuts.length) {
      const alreadyRestocked = await prisma.stockMovement.findFirst({ where: { reference: order.id, type: 'bom_restock' } });
      if (!alreadyRestocked) {
        await prisma.$transaction(async (tx) => {
          for (const line of order.bomSnapshot || []) {
            const qty = Number(line.effectiveQty);
            if (!Number.isFinite(qty) || qty <= 0) continue;
            const inc = Math.round(qty * 100) / 100;
            await tx.rawMaterial.update({ where: { id: line.rawMaterialId }, data: { onHand: { increment: inc } } }).catch(()=>{});
            await tx.stockMovement.create({ data: {
              rawMaterialId: line.rawMaterialId,
              type: 'bom_restock',
              quantity: Math.round(inc),
              reason: `Custom order ${order.orderNumber} cancelled — restock`,
              reference: order.id,
              userId: actorId,
            }});
          }
          const paperId = order.spec && typeof order.spec === 'object' ? order.spec.paperStockId : null;
          if (paperId) {
            const dec = Number(order.spec.stemCount) || 1;
            await tx.paperStock.update({ where: { id: paperId }, data: { onHand: { increment: dec } } }).catch(()=>{});
          }
        });
      }
    }
  }

  const updated = await prisma.customArtOrder.update({ where: { id: order.id }, data: { state: targetState, ...(targetState === 'dispatched_pickup_ready' ? { dispatchedAt: new Date() } : {}) } });
  await prisma.customArtOrderHistory.create({ data: { orderId: order.id, fromState: order.state, toState: targetState, note: note ? String(note).slice(0,500) : null, byUserId: actorId } });
  return updated;
}
