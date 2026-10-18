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

// ── Reject (approve lives in Phase 2 routes) ───────────────────────────────
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
