// Procedure → recipe import pipeline (staging + review).
//
// POST /analyze runs the extractor (LLM when configured, rules otherwise) on
// a document's text, matches materials against RawMaterials, prices the
// result with the bomPricing math, and stores a PENDING proposal. Reviewers
// edit it (PATCH) and then approve/reject — approval materialises materials,
// recipe, draft product and procedure document (Phase 2).
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { audit } from '../lib/audit.js';
import { noStore } from '../lib/http-cache.js';
import { analyzeAndPlan, priceProposal, matchMaterials } from '../services/procedureAnalyzer.js';
import { pricingConfig } from '../services/bomPricing.js';

const router = Router();
const EDITOR_ROLES = ['admin', 'developer', 'maker', 'staff'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const analyzeLimit = rateLimit('procedure_import', 20, 60);

const materialPlanRow = z.object({
  name: z.string().min(1).max(200),
  spec: z.string().max(200).nullable().optional(),
  unit: z.enum(['sheet', 'meter', 'stick', 'roll', 'piece', 'ml', 'gram']),
  qtyPerUnit: z.number().positive().max(100000),
  wasteFactor: z.number().min(0).max(1).optional(),
  estimatedCostPerUnit: z.number().min(0).max(100000).nullable().optional(),
  colour: z.string().max(60).nullable().optional(),
  weightValue: z.number().positive().max(10000).nullable().optional(),
  weightUnit: z.enum(['lb', 'gsm']).nullable().optional(),
  size: z.string().max(40).nullable().optional(),
  brand: z.string().max(80).nullable().optional(),
  // matcher output (client may re-bind rows in review)
  action: z.enum(['reuse', 'create']).optional(),
  rawMaterialId: z.string().max(100).nullable().optional(),
  costPerUnit: z.number().min(0).max(100000).optional(),
});

const analyzeSchema = z.object({
  documentId: z.string().uuid().optional(),
  text: z.string().max(262144).optional(),
  sourceName: z.string().max(255).optional(),
}).refine((d) => d.documentId || (d.text && d.text.trim().length >= 40), {
  message: 'documentId or at least 40 chars of text required',
});

const patchSchema = z.object({
  materialPlan: z.array(materialPlanRow).min(1).max(60).optional(),
  labourMinutesPerUnit: z.number().min(0).max(100000).optional(),
  cricutMinutesPerUnit: z.number().min(0).max(100000).optional(),
  productProposal: z.object({
    title: z.string().min(2).max(200).optional(),
    sku: z.string().max(50).nullable().optional(),
    description: z.string().max(10000).nullable().optional(),
    price: z.number().min(0).max(1000000).optional(),
  }).partial().optional(),
  reviewNote: z.string().max(2000).nullable().optional(),
});

const cleanProposal = (row) => row;

// ── Analyse a document (or raw text) into a pending proposal ───────────────
router.post('/analyze', authenticate, requireRole(...EDITOR_ROLES), analyzeLimit, validate(analyzeSchema), asyncHandler(async (req, res) => {
  const { documentId, text, sourceName } = req.validated;
  let rawText = text;
  let name = sourceName || 'inline text';
  let doc = null;
  if (documentId) {
    if (!UUID_RE.test(documentId)) return res.status(400).json({ error: 'Invalid documentId', code: 'validation_failed' });
    doc = await prisma.businessDocument.findFirst({ where: { id: documentId, deletedAt: null } });
    if (!doc) return res.status(404).json({ error: 'Document not found', code: 'not_found' });
    if (!doc.extractedText?.trim()) {
      return res.status(422).json({ error: 'Document has no extracted text yet — run OCR/extraction first', code: 'no_extracted_text' });
    }
    rawText = doc.extractedText;
    name = doc.title || doc.originalName;
  }

  const { analysis, engine, materialPlan, pricing } = await analyzeAndPlan(rawText, name);
  if (!analysis.isProcedure) {
    return res.status(422).json({
      error: 'The document does not look like a procedure',
      code: 'not_a_procedure',
      confidence: analysis.confidence,
      engine,
    });
  }

  const row = await prisma.procedureImport.create({
    data: {
      sourceDocumentId: doc?.id || null,
      sourceName: name,
      extracted: analysis,
      materialPlan,
      labourMinutesPerUnit: analysis.labourMinutesPerUnit,
      cricutMinutesPerUnit: analysis.cricutMinutesPerUnit,
      pricing,
      productProposal: {
        title: analysis.title,
        sku: analysis.sku || null,
        description: analysis.description || null,
        price: pricing.retail,
        type: 'made_to_order',
      },
      createdBy: req.user.id,
    },
  });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'procedure_import_analyze', entityType: 'procedure_import', entityId: row.id, details: { engine, source: name, materials: materialPlan.length } });
  res.status(201).json({ import: cleanProposal(row), engine });
}));

// ── Review queue / detail ──────────────────────────────────────────────────
router.get('/', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const rows = await prisma.procedureImport.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, sourceName: true, status: true, pricing: true, createdAt: true, reviewNote: true,
      extracted: true, productProposal: true,
    },
  });
  noStore(res);
  res.json(rows.map((r) => ({ ...r, title: r.extracted?.title, confidence: r.extracted?.confidence })));
}));

router.get('/materials/search', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  const where = q ? {
    OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }, { colour: { contains: q, mode: 'insensitive' } }],
  } : {};
  const rows = await prisma.rawMaterial.findMany({
    where, take: 20, orderBy: { name: 'asc' },
    select: { id: true, sku: true, name: true, unit: true, costPerUnit: true, colour: true, weightValue: true, weightUnit: true, size: true, brand: true },
  });
  noStore(res);
  res.json(rows);
}));

router.get('/:id', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const row = await prisma.procedureImport.findUnique({ where: { id } });
  if (!row) return res.status(404).json({ error: 'Import not found', code: 'not_found' });
  noStore(res);
  res.json(cleanProposal(row));
}));

// ── Edit the proposal (only while pending) ─────────────────────────────────
router.patch('/:id', authenticate, requireRole(...EDITOR_ROLES), validate(patchSchema), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const row = await prisma.procedureImport.findUnique({ where: { id } });
  if (!row) return res.status(404).json({ error: 'Import not found', code: 'not_found' });
  if (row.status !== 'pending') return res.status(409).json({ error: 'Only pending imports can be edited', code: 'not_pending' });

  const data = {};
  if (req.validated.materialPlan) {
    // Re-match rows the client may have re-bound (rawMaterialId without action).
    const plan = await matchMaterials(req.validated.materialPlan.map((m) => ({
      ...m,
      action: m.rawMaterialId ? 'reuse' : m.action === 'reuse' ? 'reuse' : 'create',
    })));
    // honour explicit re-binds: keep the client's rawMaterialId when set
    data.materialPlan = plan.map((p, i) => {
      const client = req.validated.materialPlan[i];
      const bound = client?.rawMaterialId
        ? { ...p, action: 'reuse', rawMaterialId: client.rawMaterialId }
        : p;
      return { ...bound, costPerUnit: client?.costPerUnit ?? bound.costPerUnit };
    });
  }
  if (req.validated.labourMinutesPerUnit !== undefined) data.labourMinutesPerUnit = req.validated.labourMinutesPerUnit;
  if (req.validated.cricutMinutesPerUnit !== undefined) data.cricutMinutesPerUnit = req.validated.cricutMinutesPerUnit;
  if (req.validated.productProposal) data.productProposal = { ...(row.productProposal || {}), ...req.validated.productProposal };
  if (req.validated.reviewNote !== undefined) data.reviewNote = req.validated.reviewNote;

  // Prices always recompute server-side from the current plan/minutes.
  const plan = data.materialPlan || row.materialPlan;
  const labour = data.labourMinutesPerUnit ?? row.labourMinutesPerUnit;
  const cricut = data.cricutMinutesPerUnit ?? row.cricutMinutesPerUnit;
  const cfg = await pricingConfig().catch(() => ({}));
  data.pricing = priceProposal(plan, labour, cricut, cfg);
  if (data.productProposal && req.validated.productProposal?.price === undefined) {
    data.productProposal = { ...data.productProposal, price: data.pricing.retail };
  }

  const updated = await prisma.procedureImport.update({ where: { id }, data });
  res.json(cleanProposal(updated));
}));


// ── Approve: materialise the proposal ──────────────────────────────────────
// Creates missing RawMaterials, (re)creates the BOMRecipe, an inactive draft
// Product (unless the reviewer bound an existing one), and a draft
// ProcedureDocument — prices rechecked server-side first.
const approveSchema = z.object({
  createProduct: z.boolean().default(true),
  createProcedureDocument: z.boolean().default(true),
  product: z.object({
    title: z.string().min(2).max(200).optional(),
    sku: z.string().max(50).nullable().optional(),
    price: z.number().min(0).max(1000000).optional(),
    productId: z.string().min(8).max(100).nullable().optional(),
  }).optional(),
});

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'procedure';
}

router.post('/:id/approve', authenticate, requireRole(...EDITOR_ROLES), validate(approveSchema), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const row = await prisma.procedureImport.findUnique({ where: { id } });
  if (!row) return res.status(404).json({ error: 'Import not found', code: 'not_found' });
  if (row.status !== 'pending') return res.status(409).json({ error: 'Only pending imports can be approved', code: 'not_pending' });

  const plan = Array.isArray(row.materialPlan) ? row.materialPlan : [];
  const proposal = (row.productProposal && typeof row.productProposal === 'object') ? row.productProposal : {};
  const extracted = (row.extracted && typeof row.extracted === 'object') ? row.extracted : {};
  const cfg = await pricingConfig().catch(() => ({}));
  const pricing = priceProposal(plan, row.labourMinutesPerUnit, row.cricutMinutesPerUnit, cfg);
  const { createProduct, createProcedureDocument, product: productOverride } = req.validated;

  // 1. missing material profiles
  const createdMaterialIds = [];
  const lineByMaterial = new Map();
  for (const m of plan) {
    let rawId = m.rawMaterialId;
    if (m.action === 'create' || !rawId) {
      const baseSku = String(m.sku || `RM-${slugify(m.name).toUpperCase().slice(0, 30)}`).slice(0, 50);
      let sku = baseSku;
      for (let i = 2; await prisma.rawMaterial.findUnique({ where: { sku } }); i++) sku = `${baseSku.slice(0, 45)}-${i}`;
      const created = await prisma.rawMaterial.create({
        data: {
          sku, name: String(m.name).slice(0, 200), unit: m.unit || 'piece',
          costPerUnit: Number(m.costPerUnit || 0), colour: m.colour || null,
          weightValue: m.weightValue || null, weightUnit: m.weightUnit || null,
          size: m.size || null, brand: m.brand || null,
        },
      });
      rawId = created.id;
      createdMaterialIds.push(created.id);
    }
    lineByMaterial.set(rawId, m);
  }

  // 2. product (inactive draft unless the reviewer bound an existing one)
  let productId = productOverride?.productId || null;
  if (!productId && createProduct) {
    const title = String(productOverride?.title || proposal.title || 'Imported procedure').slice(0, 200);
    const baseSlug = slugify(title);
    let slug = baseSlug;
    for (let i = 2; await prisma.product.findUnique({ where: { slug } }); i++) slug = `${baseSlug.slice(0, 70)}-${i}`;
    const prod = await prisma.product.create({
      data: {
        title, slug,
        sku: productOverride?.sku || proposal.sku || undefined,
        description: String(proposal.description || '').slice(0, 10000) || null,
        price: Number(productOverride?.price ?? proposal.price ?? pricing.retail),
        type: 'made_to_order', stockMode: 'made_to_order',
        isActive: false, // draft — reviewer publishes when ready
      },
    });
    productId = prod.id;
  }
  if (!productId) {
    return res.status(400).json({ error: 'Approve needs a product — enable createProduct or bind an existing productId', code: 'validation_failed' });
  }

  // 3. recipe (replace semantics, same as POST /recipes)
  const existingRecipe = await prisma.bOMRecipe.findFirst({ where: { productId, variantId: null } });
  if (existingRecipe) await prisma.bOMLine.deleteMany({ where: { recipeId: existingRecipe.id } });
  const recipe = existingRecipe
    ? await prisma.bOMRecipe.update({ where: { id: existingRecipe.id }, data: { labourMinutesPerUnit: row.labourMinutesPerUnit, cricutMinutesPerUnit: row.cricutMinutesPerUnit } })
    : await prisma.bOMRecipe.create({ data: { productId, labourMinutesPerUnit: row.labourMinutesPerUnit, cricutMinutesPerUnit: row.cricutMinutesPerUnit } });
  for (const [rawId, m] of lineByMaterial) {
    await prisma.bOMLine.create({
      data: { recipeId: recipe.id, rawMaterialId: rawId, qtyPerUnit: Number(m.qtyPerUnit) || 1, wasteFactor: Number(m.wasteFactor ?? 0.05) },
    });
  }

  // 4. draft procedure document (the manufacturing spec)
  let procedureDocumentId = null;
  if (createProcedureDocument) {
    const steps = Array.isArray(extracted.steps) ? extracted.steps : [];
    const content = `# ${extracted.title || 'Procedure'}\n\n${steps.map((st, i) => `${i + 1}. ${st}`).join('\n')}${row.sourceName ? `\n\nSource: ${row.sourceName}` : ''}`;
    const doc = await prisma.procedureDocument.create({
      data: {
        title: String(extracted.title || 'Imported procedure').slice(0, 200),
        category: ['FLOWER', 'BOUQUET', 'FOLIAGE', 'DECOR', 'PACKAGING', 'MANUFACTURING_SPEC'].includes(extracted.category) ? extracted.category : 'FLOWER',
        subcategory: ['ORIGAMI', 'CREPE_PAPER', 'DIE_CUT', 'SCULPTURAL', 'HAND_ASSEMBLY'].includes(extracted.subcategory) ? extracted.subcategory : null,
        sku: proposal.sku || undefined,
        contentMarkdown: content.slice(0, 100000),
        metadata: { estimatedTimeMinutes: extracted.estimatedTimeMinutes ?? null, sourceImportId: id, labourMinutesPerUnit: row.labourMinutesPerUnit },
        status: 'draft',
        authorId: req.user.id || undefined,
      },
    });
    procedureDocumentId = doc.id;
  }

  // Link the manufactured product back to its procedure document so the two
  // are navigable both ways (DB↔procedure pipeline).
  if (productId && procedureDocumentId) {
    await prisma.product.update({ where: { id: productId }, data: { procedureDocumentId } }).catch(() => {});
  }

  const updated = await prisma.procedureImport.update({
    where: { id },
    data: {
      status: 'approved', pricing,
      reviewedById: req.user.id,
      result: { productId, recipeId: recipe.id, procedureDocumentId, createdMaterialIds },
    },
  });
  audit({
    actorId: req.user.id, actorEmail: req.user.email, action: 'procedure_import_approve', entityType: 'procedure_import', entityId: id,
    details: { productId, recipeId: recipe.id, procedureDocumentId, createdMaterials: createdMaterialIds.length },
  });
  res.json({ import: cleanProposal(updated), result: updated.result });
}));

// ── Reject ─────────────────────────────────────────────────────────────────
router.post('/:id/reject', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const row = await prisma.procedureImport.findUnique({ where: { id } });
  if (!row) return res.status(404).json({ error: 'Import not found', code: 'not_found' });
  if (row.status !== 'pending') return res.status(409).json({ error: 'Only pending imports can be rejected', code: 'not_pending' });
  const note = String(req.body?.note || '').slice(0, 2000);
  const updated = await prisma.procedureImport.update({
    where: { id },
    data: { status: 'rejected', reviewNote: note || row.reviewNote, reviewedById: req.user.id },
  });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'procedure_import_reject', entityType: 'procedure_import', entityId: id });
  res.json(cleanProposal(updated));
}));

export default router;
