import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/lib/prisma.js';
import { __setLlmAnalyze, analyzeWithRules } from '../src/services/procedureAnalyzer.js';
import { startServer, api } from './helpers.js';

// Procedure → recipe import pipeline (Phase 1): analysis (rules + stubbed
// LLM), material matching (reuse vs create), pricing snapshot (bomPricing
// math), staged pending proposals with edit/reject.
let srv;
let adminToken;

const auth = () => ({ Authorization: `Bearer ${adminToken}` });
const UNIQUE = Date.now().toString(36);

const PROCEDURE = `# Paper Rose Bouquet ${UNIQUE}
SKU: KFK-ROSE-${UNIQUE}

## Materials
- 5 sheets 65lb cardstock blush
- 2 meters floral tape
- 1 piece 18ga wire

## Steps
1. Cut petals with the Cricut
2. Curl and assemble the bloom

Time: 45 minutes
`;

const NOT_A_PROCEDURE = `Hi team, the delivery arrives Tuesday. Please confirm the invoice total before month end. Thanks!`;

before(async () => {
  srv = await startServer();
  const login = await api(srv.base, '/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  assert.equal(login.status, 200);
  adminToken = login.body.token;
});
after(async () => {
  await prisma.procedureImport.deleteMany({ where: { sourceName: { contains: UNIQUE } } }).catch(() => {});
  // PI- skus are test-only: purge ALL runs' leftovers, not just this UNIQUE
  await prisma.rawMaterial.deleteMany({ where: { sku: { startsWith: 'PI-' } } }).catch(() => {});
  await srv.close();
});

test('rule engine parses a procedure: materials, units, labour, cricut', () => {
  const a = analyzeWithRules(PROCEDURE, 'rose.txt');
  assert.equal(a.isProcedure, true);
  assert.equal(a.title, `Paper Rose Bouquet ${UNIQUE}`);
  assert.equal(a.materials.length, 3, JSON.stringify(a.materials));
  const [card, tape, wire] = a.materials;
  assert.equal(card.unit, 'sheet');
  assert.equal(card.qtyPerUnit, 5);
  assert.equal(card.colour, 'blush');
  assert.equal(card.weightValue, 65);
  assert.equal(tape.unit, 'meter');
  assert.equal(tape.qtyPerUnit, 2);
  assert.equal(wire.unit, 'piece');
  assert.equal(a.labourMinutesPerUnit, 45);
  assert.equal(a.cricutMinutesPerUnit, 8);
});

test('rule engine rejects non-procedures', () => {
  const a = analyzeWithRules(NOT_A_PROCEDURE, 'letter.txt');
  assert.equal(a.isProcedure, false);
});

test('analyze creates a pending proposal with a pricing snapshot', async () => {
  const res = await api(srv.base, '/api/procedure-imports/analyze', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ text: PROCEDURE, sourceName: `prop-${UNIQUE}.txt` }),
  });
  assert.equal(res.status, 201, JSON.stringify(res.body).slice(0, 300));
  assert.equal(res.body.engine, 'rules');
  assert.equal(res.body.import.status, 'pending');
  assert.equal(res.body.import.materialPlan.length, 3);
  const p = res.body.import.pricing;
  assert.ok(p.materialsCost >= 0 && p.retail > 0, JSON.stringify(p));
  assert.equal(p.retail, Math.round(p.withLabour * p.margin * 100) / 100, 'retail = withLabour × margin');
  assert.equal(res.body.import.productProposal.title, `Paper Rose Bouquet ${UNIQUE}`);
  assert.equal(res.body.import.productProposal.price, p.retail, 'product proposal priced from the snapshot');
});

test('materials match existing RawMaterials and propose new ones', async () => {
  const existing = await prisma.rawMaterial.create({
    data: {
      sku: `PI-${UNIQUE}-CARD`, name: '65lb Cardstock – Blush', unit: 'sheet',
      costPerUnit: 0.8, colour: 'Blush', weightValue: 65, weightUnit: 'lb',
    },
  });
  const res = await api(srv.base, '/api/procedure-imports/analyze', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ text: PROCEDURE, sourceName: `match-${UNIQUE}.txt` }),
  });
  assert.equal(res.status, 201, JSON.stringify(res.body).slice(0, 300));
  const card = res.body.import.materialPlan.find((m) => m.name.toLowerCase().includes('cardstock'));
  assert.equal(card.action, 'reuse', `expected reuse, got ${JSON.stringify(card)}`);
  assert.equal(card.rawMaterialId, existing.id);
  assert.equal(card.costPerUnit, 0.8, 'reuse keeps the existing cost');
  const wire = res.body.import.materialPlan.find((m) => m.name.toLowerCase().includes('wire'));
  assert.equal(wire.action, 'create');
});

test('PATCH edits recompute the pricing server-side', async () => {
  const created = await api(srv.base, '/api/procedure-imports/analyze', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ text: PROCEDURE, sourceName: `edit-${UNIQUE}.txt` }),
  });
  assert.equal(created.status, 201);
  const id = created.body.import.id;
  const plan = created.body.import.materialPlan.map((m) => ({ ...m, qtyPerUnit: m.qtyPerUnit * 2, costPerUnit: 5 }));
  const patched = await api(srv.base, `/api/procedure-imports/${id}`, {
    method: 'PATCH', headers: auth(),
    body: JSON.stringify({ materialPlan: plan, labourMinutesPerUnit: 30, reviewNote: 'doubled' }),
  });
  assert.equal(patched.status, 200, JSON.stringify(patched.body).slice(0, 300));
  const p = patched.body.pricing;
  assert.ok(p.retail > created.body.import.pricing.retail, 'price grows with quantities');
  assert.equal(p.retail, Math.round(p.withLabour * p.margin * 100) / 100);
  assert.equal(patched.body.reviewNote, 'doubled');

  // reject locks editing
  const rejected = await api(srv.base, `/api/procedure-imports/${id}/reject`, {
    method: 'POST', headers: auth(), body: JSON.stringify({ note: 'needs rework' }),
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.status, 'rejected');
  const edit = await api(srv.base, `/api/procedure-imports/${id}`, {
    method: 'PATCH', headers: auth(), body: JSON.stringify({ reviewNote: 'x' }),
  });
  assert.equal(edit.status, 409);
});

test('analyze refuses non-procedure documents (422 not_a_procedure)', async () => {
  const res = await api(srv.base, '/api/procedure-imports/analyze', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ text: NOT_A_PROCEDURE, sourceName: `letter-${UNIQUE}.txt` }),
  });
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'not_a_procedure');
  assert.equal(res.body.engine, 'rules');
});

test('LLM engine (stubbed) is preferred and validated', async () => {
  __setLlmAnalyze(async () => JSON.stringify({
    isProcedure: true, confidence: 0.92, title: `LLM Proc ${UNIQUE}`, category: 'DECOR', subcategory: 'ORIGAMI',
    sku: null, description: 'from the model',
    materials: [{ name: 'Origami paper pack', unit: 'piece', qtyPerUnit: 2, wasteFactor: 0.05, estimatedCostPerUnit: 3.5 }],
    labourMinutesPerUnit: 30, cricutMinutesPerUnit: 0, estimatedTimeMinutes: 30,
    steps: ['Fold the base'],
  }));
  try {
    const res = await api(srv.base, '/api/procedure-imports/analyze', {
      method: 'POST', headers: auth(),
      body: JSON.stringify({ text: `irrelevant body text ${UNIQUE} `.repeat(10), sourceName: `llm-${UNIQUE}.txt` }),
    });
    assert.equal(res.status, 201, JSON.stringify(res.body).slice(0, 300));
    assert.equal(res.body.engine, 'llm');
    assert.equal(res.body.import.extracted.title, `LLM Proc ${UNIQUE}`);
    assert.equal(res.body.import.extracted.category, 'DECOR');
    assert.equal(res.body.import.extracted.subcategory, 'ORIGAMI');
    assert.equal(res.body.import.materialPlan[0].action, 'create');
  } finally {
    __setLlmAnalyze(null);
  }
});

test('materials search powers the remap picker', async () => {
  const res = await api(srv.base, `/api/procedure-imports/materials/search?q=PI-${UNIQUE}`, { headers: auth() });
  assert.equal(res.status, 200);
  assert.ok(res.body.length >= 1);
  assert.ok(res.body.every((m) => m.sku.startsWith(`PI-${UNIQUE}`)));
});

// ── Phase 2: approve materialises everything ───────────────────────────────

test('approve creates materials + recipe + draft product + procedure document', async () => {
  const created = await api(srv.base, '/api/procedure-imports/analyze', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ text: PROCEDURE, sourceName: `approve-${UNIQUE}.txt` }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body).slice(0, 300));
  const id = created.body.import.id;

  const approved = await api(srv.base, `/api/procedure-imports/${id}/approve`, {
    method: 'POST', headers: auth(), body: JSON.stringify({}),
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body).slice(0, 300));
  assert.equal(approved.body.import.status, 'approved');
  const result = approved.body.result || {};
  try {
    assert.ok(result.productId && result.recipeId && result.procedureDocumentId, JSON.stringify(result));
    assert.equal(result.createdMaterialIds?.length, 2, 'tape + wire created (cardstock was matched)');

    const prod = await prisma.product.findUnique({ where: { id: result.productId } });
    assert.equal(prod.isActive, false, 'product is a draft until published');
    assert.equal(prod.type, 'made_to_order');
    assert.equal(Number(prod.price), Number(approved.body.import.pricing.retail), 'priced from the snapshot');

    const recipe = await prisma.bOMRecipe.findUnique({ where: { id: result.recipeId }, include: { lines: true } });
    assert.equal(recipe.lines.length, 3);
    assert.equal(recipe.labourMinutesPerUnit, 45);
    assert.equal(recipe.cricutMinutesPerUnit, 8);

    const doc = await prisma.procedureDocument.findUnique({ where: { id: result.procedureDocumentId } });
    assert.equal(doc.status, 'draft');
    assert.equal(doc.category, 'BOUQUET', 'bouquet text → BOUQUET');
  assert.equal(doc.subcategory, 'CREPE_PAPER', 'petal/curl text → CREPE_PAPER');
    assert.match(doc.contentMarkdown, /Cut petals/);
  } finally {
    // cleanup (hard deletes — test artefacts) — runs even when an assert throws,
    // otherwise a failed run leaks materials/products that break the NEXT run
    await prisma.bOMLine.deleteMany({ where: { recipeId: result.recipeId } }).catch(() => {});
    await prisma.bOMRecipe.delete({ where: { id: result.recipeId } }).catch(() => {});
    await prisma.procedureDocument.delete({ where: { id: result.procedureDocumentId } }).catch(() => {});
    await prisma.product.delete({ where: { id: result.productId } }).catch(() => {});
    await prisma.rawMaterial.deleteMany({ where: { id: { in: result.createdMaterialIds || [] } } }).catch(() => {});
  }
});

test('approve can bind an existing product and skip the procedure doc', async () => {
  const created = await api(srv.base, '/api/procedure-imports/analyze', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ text: PROCEDURE, sourceName: `bind-${UNIQUE}.txt` }),
  });
  assert.equal(created.status, 201);
  const id = created.body.import.id;
  // throwaway product — never touch the seeded recipe that other suites rely on
  const target = await prisma.product.create({
    data: { title: `PI Bind ${UNIQUE}`, slug: `pi-bind-${UNIQUE}`, price: 10, type: 'made_to_order', stockMode: 'made_to_order' },
  });

  const approved = await api(srv.base, `/api/procedure-imports/${id}/approve`, {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ createProduct: false, createProcedureDocument: false, product: { productId: target.id } }),
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body).slice(0, 300));
  assert.equal(approved.body.result.productId, target.id);
  assert.equal(approved.body.result.procedureDocumentId, null);

  // second approve is single-shot
  const again = await api(srv.base, `/api/procedure-imports/${id}/approve`, { method: 'POST', headers: auth(), body: JSON.stringify({}) });
  assert.equal(again.status, 409);

  // cleanup: everything this test created (never shared/seeded rows)
  await prisma.bOMLine.deleteMany({ where: { recipeId: approved.body.result.recipeId } });
  await prisma.bOMRecipe.delete({ where: { id: approved.body.result.recipeId } }).catch(() => {});
  await prisma.product.delete({ where: { id: target.id } }).catch(() => {});
  await prisma.rawMaterial.deleteMany({ where: { id: { in: approved.body.result.createdMaterialIds || [] } } }).catch(() => {});
});
