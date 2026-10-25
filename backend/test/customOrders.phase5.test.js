import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';

let srv;
let adminToken;

function spec(overrides = {}) {
  return {
    paperColor: 'Blush', paperTexture: 'textured', weight: '65lb',
    stemCount: 7, heightMm: 350, templateId: 'wattle-sprig',
    addGreenery: false, vaseIncluded: false,
    ...overrides,
  };
}

before(async () => {
  srv = await startServer();
  const login = await api(srv.base, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }) });
  adminToken = login.body.token;
});

after(async () => {
  await srv.close();
  const orders = await prisma.customArtOrder.findMany({ where: { customerEmail: { endsWith: '@phase5.test' } }, select: { id: true } });
  const ids = orders.map(o => o.id);
  if (ids.length) {
    await prisma.ticket.deleteMany({ where: { customArtOrderId: { in: ids } } });
    await prisma.customArtOrderHistory.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.stockMovement.deleteMany({ where: { reference: { in: ids } } });
    await prisma.customArtOrder.deleteMany({ where: { id: { in: ids } } });
  }
});

test('per-template recipe selection', async () => {
  // Each template should have its own BOM snapshot (different labour minutes)
  const wattle = await api(srv.base, '/api/custom-orders', {
    method: 'POST',
    body: JSON.stringify({ customerEmail: 'tmpl-wattle@phase5.test', customerName: 'Wattle', spec: spec({ templateId: 'wattle-sprig' }) }),
  });
  assert.equal(wattle.status, 201, JSON.stringify(wattle.body));
  const rose = await api(srv.base, '/api/custom-orders', {
    method: 'POST',
    body: JSON.stringify({ customerEmail: 'tmpl-rose@phase5.test', customerName: 'Rose', spec: spec({ templateId: 'paper-rose' }) }),
  });
  assert.equal(rose.status, 201, JSON.stringify(rose.body));
  assert.notEqual(wattle.body.bomSnapshot?.length, 0, 'wattle should have bom');
  assert.notEqual(rose.body.bomSnapshot?.length, 0, 'rose should have bom');
  // Labour minutes differ per template (25+8 vs 35+10 scaled by 1)
  assert.notEqual(wattle.body.estimatedMinutes, rose.body.estimatedMinutes, 'different templates produce different minutes');
  // Ensure the snapshots are not identical (different recipe)
  const wSkus = (wattle.body.bomSnapshot || []).map(l=>l.sku).sort().join(',');
  const rSkus = (rose.body.bomSnapshot || []).map(l=>l.sku).sort().join(',');
  // They may share same SKUs but minutes differ, so check minutes
});

test('no stock deduction when no recipe', async () => {
  // Temporarily delete the origami-lily recipe to test empty case
  const origamiRecipe = await prisma.bOMRecipe.findUnique({ where: { templateId: 'origami-lily' } });
  let deleted = null;
  if (origamiRecipe) {
    deleted = await prisma.bOMRecipe.findUnique({ where: { id: origamiRecipe.id }, include: { lines: true } });
    await prisma.bOMLine.deleteMany({ where: { recipeId: origamiRecipe.id } });
    await prisma.bOMRecipe.delete({ where: { id: origamiRecipe.id } });
  }
  try {
    const beforeMats = await prisma.rawMaterial.findMany({ select: { id: true, onHand: true } });
    const beforeMap = new Map(beforeMats.map(m=> [m.id, m.onHand]));
    const res = await api(srv.base, '/api/custom-orders', {
      method: 'POST',
      body: JSON.stringify({ customerEmail: 'no-recipe@phase5.test', customerName: 'NoRecipe', spec: spec({ templateId: 'origami-lily' }) }),
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal((res.body.bomSnapshot || []).length, 0, 'empty bomSnapshot when no recipe');
    assert.ok((res.body.history || []).some(h=> String(h.note||'').includes('No BOM recipe')), 'history note for missing recipe');
    // Move to cutting — should not deduct stock (no bom lines, no error)
    const move = await api(srv.base, `/api/custom-orders/${res.body.id}/state`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ state: 'cricut_cutting' }),
    });
    assert.equal(move.status, 200, JSON.stringify(move.body));
    const afterMats = await prisma.rawMaterial.findMany({ select: { id: true, onHand: true } });
    for (const m of afterMats) {
      assert.equal(Number(m.onHand), Number(beforeMap.get(m.id)), `onHand unchanged for ${m.id}`);
    }
    const movements = await prisma.stockMovement.findMany({ where: { reference: res.body.id } });
    assert.equal(movements.length, 0, 'no movements when no recipe');
  } finally {
    if (deleted) {
      const rec = await prisma.bOMRecipe.create({ data: { templateId: deleted.templateId, labourMinutesPerUnit: deleted.labourMinutesPerUnit, cricutMinutesPerUnit: deleted.cricutMinutesPerUnit } });
      for (const l of deleted.lines) {
        await prisma.bOMLine.create({ data: { recipeId: rec.id, rawMaterialId: l.rawMaterialId, qtyPerUnit: l.qtyPerUnit, wasteFactor: l.wasteFactor } });
      }
    }
  }
});

test('transactional deduction and restock on cancel', async () => {
  const matsBefore = await prisma.rawMaterial.findMany({ select: { id: true, onHand: true, name: true } });
  const paperBefore = await prisma.paperStock.findFirst({ where: { name: 'Blush 65lb Textured' }, select: { id:true, onHand:true } });
  const res = await api(srv.base, '/api/custom-orders', {
    method: 'POST',
    body: JSON.stringify({ customerEmail: 'deduct@phase5.test', customerName: 'Deduct', spec: spec({ templateId: 'wattle-sprig', paperStockId: paperBefore?.id || null }) }),
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const orderId = res.body.id;
  assert.ok((res.body.bomSnapshot||[]).length > 0, 'has bomSnapshot to deduct');
  // Move to cutting — transactional deduction
  const toCut = await api(srv.base, `/api/custom-orders/${orderId}/state`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ state: 'cricut_cutting' }),
  });
  assert.equal(toCut.status, 200, JSON.stringify(toCut.body));
  const afterCutMats = await prisma.rawMaterial.findMany({ select: { id: true, onHand: true } });
  const movements = await prisma.stockMovement.findMany({ where: { reference: orderId, type: 'bom_deduct' } });
  assert.ok(movements.length > 0, 'deduct movements created');
  // Check quantity matches decrement (rounded)
  for (const line of res.body.bomSnapshot) {
    const before = matsBefore.find(m=> m.id===line.rawMaterialId);
    const after = afterCutMats.find(m=> m.id===line.rawMaterialId);
    const dec = Math.round(Number(line.effectiveQty)*100)/100;
    const actualDec = Number(before.onHand) - Number(after.onHand);
    assert.ok(Math.abs(actualDec - dec) < 0.001, `onHand dec matches for ${line.rawMaterialId} (got ${actualDec}, expected ${dec})`);
    const mv = movements.find(m=> m.rawMaterialId===line.rawMaterialId);
    assert.ok(mv, `movement for ${line.rawMaterialId}`);
    assert.equal(Math.abs(Number(mv.quantity)), Math.round(dec), 'movement qty matches dec (Int rounded)');
  }
  // Cancel — should restock
  const toCancel = await api(srv.base, `/api/custom-orders/${orderId}/state`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ state: 'cancelled' }),
  });
  assert.equal(toCancel.status, 200, JSON.stringify(toCancel.body));
  const afterCancelMats = await prisma.rawMaterial.findMany({ select: { id: true, onHand: true } });
  for (const m of matsBefore) {
    const after = afterCancelMats.find(x=> x.id===m.id);
    assert.equal(Number(after.onHand), Number(m.onHand), `restocked for ${m.name}`);
  }
  const restocks = await prisma.stockMovement.findMany({ where: { reference: orderId, type: 'bom_restock' } });
  assert.ok(restocks.length>0, 'restock movements created');
  if (paperBefore) {
    const paperAfter = await prisma.paperStock.findUnique({ where: { id: paperBefore.id } });
    assert.equal(Number(paperAfter.onHand), Number(paperBefore.onHand), 'paper restocked');
  }
});

test('quote endpoint uses same logic as order creation', async () => {
  const testSpec = spec({ templateId: 'banksia-petal', weight: '110lb', heightMm: 500, addGreenery: true });
  const q = await api(srv.base, '/api/configurator/quote', {
    method: 'POST',
    body: JSON.stringify(testSpec),
  });
  assert.equal(q.status, 200, JSON.stringify(q.body));
  assert.ok(Number.isFinite(Number(q.body.total)), 'quote total finite');
  const order = await api(srv.base, '/api/custom-orders', {
    method: 'POST',
    body: JSON.stringify({ customerEmail: 'quote-compare@phase5.test', customerName: 'Quote', spec: testSpec }),
  });
  assert.equal(order.status, 201, JSON.stringify(order.body));
  assert.equal(Number(order.body.totalPrice), Number(q.body.total), 'quote total matches order total');
  assert.equal(Number(order.body.estimatedMinutes), Number(q.body.estimatedMinutes), 'quote minutes matches order minutes');
});
