import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';
import { buildBOMSnapshot, leadDaysFor } from '../src/services/orderBom.js';

let srv;
let productId;
let materialIds = [];
let recipeId = null;
let restoreRecipe = null;
const createdOrderNumbers = [];

before(async () => {
  srv = await startServer();
  const { body } = await api(srv.base, '/api/products');
  productId = body.products.find((p) => p.slug === 'eucalyptus-paper-rose-bouquet-blush').id;
});

after(async () => {
  await srv.close();
  if (recipeId) await prisma.bOMRecipe.delete({ where: { id: recipeId } }).catch(() => {});
  if (restoreRecipe) {
    await prisma.bOMLine.deleteMany({ where: { recipeId: restoreRecipe.id } }).catch(() => {});
    await prisma.bOMRecipe.update({ where: { id: restoreRecipe.id }, data: { labourMinutesPerUnit: restoreRecipe.labourMinutesPerUnit, cricutMinutesPerUnit: restoreRecipe.cricutMinutesPerUnit } }).catch(() => {});
  }
  if (materialIds.length) await prisma.rawMaterial.deleteMany({ where: { id: { in: materialIds } } }).catch(() => {});
  const orders = await prisma.order.findMany({ where: { orderNumber: { in: createdOrderNumbers } }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  if (ids.length) {
    await prisma.orderLine.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }
});

test('leadDaysFor floors at 3 days and scales with labour hours', () => {
  assert.equal(leadDaysFor(0), 3);
  assert.equal(leadDaysFor(60), 3); // 1h → ceil(0.5) = 1 → floor 3
  assert.equal(leadDaysFor(12 * 60), 6); // 12h → 6 days
});

test('buildBOMSnapshot aggregates materials across lines and derives hours + lead days', () => {
  const snap = buildBOMSnapshot([
    {
      orderLineId: 'l1', title: 'Bouquet A', quantity: 2, recipeId: 'r1', labourMinutes: 80, materialsCost: 12.5,
      materials: [
        { sku: 'PAPER-65', name: 'Crepe paper 65lb', unit: 'meter', qty: 3.2, cost: 9 },
        { sku: 'WIRE-18', name: '18 gauge wire', unit: 'stick', qty: 14, cost: 3.5 },
      ],
    },
    {
      orderLineId: 'l2', title: 'Bouquet B', quantity: 1, recipeId: 'r1', labourMinutes: 40, materialsCost: 6.25,
      materials: [
        { sku: 'PAPER-65', name: 'Crepe paper 65lb', unit: 'meter', qty: 1.6, cost: 4.5 },
      ],
    },
  ]);
  assert.equal(snap.labourMinutes, 120);
  assert.equal(snap.labourHours, 2);
  assert.equal(snap.materialsCost, 18.75);
  assert.equal(snap.estimatedLeadDays, 3); // 2h → 1 → floor 3
  const paper = snap.materials.find((m) => m.sku === 'PAPER-65');
  assert.equal(paper.qty, 4.8);
  assert.equal(paper.cost, 13.5);
  assert.equal(snap.materials.length, 2, 'aggregated per material');
});

test('checkout auto-generates the order BOM from studio recipes (paper, wire, labour)', async () => {
  const stamp = Date.now();
  const paper = await prisma.rawMaterial.create({ data: { sku: `RM-TEST-BOM-P${stamp}`, name: 'Test crepe paper', unit: 'meter', costPerUnit: 2.5 } });
  const wire = await prisma.rawMaterial.create({ data: { sku: `RM-TEST-BOM-W${stamp}`, name: 'Test 18 gauge wire', unit: 'stick', costPerUnit: 0.5 } });
  materialIds = [paper.id, wire.id];
  const existing = await prisma.bOMRecipe.findFirst({ where: { productId, variantId: null } });
  const recipe = existing
    ? await prisma.bOMRecipe.update({ where: { id: existing.id }, data: { labourMinutesPerUnit: 30, cricutMinutesPerUnit: 10 } })
    : await prisma.bOMRecipe.create({ data: { productId, variantId: null, labourMinutesPerUnit: 30, cricutMinutesPerUnit: 10 } });
  // Only delete what we created — a pre-existing recipe is restored, not removed.
  if (existing) {
    recipeId = null;
    restoreRecipe = { id: existing.id, labourMinutesPerUnit: existing.labourMinutesPerUnit, cricutMinutesPerUnit: existing.cricutMinutesPerUnit };
  } else {
    recipeId = recipe.id;
  }
  await prisma.bOMLine.deleteMany({ where: { recipeId: recipe.id } });
  await prisma.bOMLine.createMany({ data: [
    { recipeId: recipe.id, rawMaterialId: paper.id, qtyPerUnit: 1.5, wasteFactor: 0 },
    { recipeId: recipe.id, rawMaterialId: wire.id, qtyPerUnit: 6, wasteFactor: 0 },
  ] });

  const add = await api(srv.base, '/api/cart/add', {
    method: 'POST',
    body: JSON.stringify({ productId, quantity: 2 }),
  });
  assert.equal(add.status, 200);
  const cartId = add.body.cartId || add.body.cart?.id;

  const { status, body } = await api(srv.base, '/api/orders/checkout', {
    method: 'POST',
    body: JSON.stringify({
      cartId,
      email: 'bom-buyer@test.com',
      shippingName: 'BOM Buyer',
      shippingAddress: '2 Test St',
      shippingSuburb: 'Perth',
      shippingState: 'WA',
      shippingPostcode: '6000',
      paymentMethod: 'bank_transfer',
    }),
  });
  assert.equal(status, 200, JSON.stringify(body).slice(0, 300));
  createdOrderNumbers.push(body.order.orderNumber);

  const order = await prisma.order.findUnique({ where: { orderNumber: body.order.orderNumber }, include: { lines: true } });
  assert.ok(order, 'order persisted');
  const snap = order.bomSnapshot;
  assert.ok(snap, 'bomSnapshot generated at checkout');
  // 2 units × (30 + 10) min
  assert.equal(snap.labourMinutes, 80);
  assert.equal(snap.labourHours, 1.33);
  assert.equal(snap.estimatedLeadDays, 3);
  // materials scale with quantity: paper 1.5×2 = 3, wire 6×2 = 12
  const paperLine = snap.materials.find((m) => m.sku === paper.sku);
  const wireLine = snap.materials.find((m) => m.sku === wire.sku);
  assert.ok(paperLine && wireLine, 'paper + wire captured');
  assert.equal(paperLine.qty, 3);
  assert.equal(wireLine.qty, 12);
  assert.equal(snap.materialsCost, Math.round((3 * 2.5 + 12 * 0.5) * 100) / 100);
  assert.equal(snap.lines.length, order.lines.filter((l) => !l.isDigital).length);
  assert.ok(snap.generatedAt, 'timestamped');
});
