// Procedure analysis → recipe-ready extraction.
//
// Takes extracted document text (OCR/PDF/XLSX pipeline) and produces a
// ProcedureAnalysis: is this a procedure, its title/category, materials with
// quantities/units, and labour estimates. Two engines:
//
// - LLM (LLM_PROVIDER=anthropic|openai + LLM_API_KEY): robust on arbitrary
//   formats/tables; strict JSON-only prompt, zod-validated. Any failure falls
//   back to rules. `__setLlmAnalyze(fn)` injects a stub so tests never hit
//   the network (same pattern as services/ocr.js).
// - Rules (always available): section/pattern parsing of consistently
//   formatted procedures — free and instant, best-effort.
//
// Also matches extracted materials against existing RawMaterials (reuse vs
// create plan) and computes the costing/sales-price snapshot with the exact
// bomPricing math (materials×waste + labour×rate, × bom_margin).
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { pricingConfig } from './bomPricing.js';
import { llmJson, llmAvailable, __setLlmCall } from './llm.js';

const UNITS = ['sheet', 'meter', 'stick', 'roll', 'piece', 'ml', 'gram'];

export const analysisSchema = z.object({
  isProcedure: z.boolean(),
  confidence: z.number().min(0).max(1),
  title: z.string().max(200),
  category: z.enum(['FLOWER', 'BOUQUET', 'FOLIAGE', 'DECOR', 'PACKAGING', 'MANUFACTURING_SPEC']),
  subcategory: z.enum(['ORIGAMI', 'CREPE_PAPER', 'DIE_CUT', 'SCULPTURAL', 'HAND_ASSEMBLY']).nullable().optional(),
  sku: z.string().max(50).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  materials: z.array(z.object({
    name: z.string().min(1).max(200),
    spec: z.string().max(200).nullable().optional(),
    unit: z.enum(UNITS),
    qtyPerUnit: z.number().positive().max(100000),
    wasteFactor: z.number().min(0).max(1).optional(),
    estimatedCostPerUnit: z.number().min(0).max(100000).nullable().optional(),
    colour: z.string().max(60).nullable().optional(),
    weightValue: z.number().positive().max(10000).nullable().optional(),
    weightUnit: z.enum(['lb', 'gsm']).nullable().optional(),
    size: z.string().max(40).nullable().optional(),
    brand: z.string().max(80).nullable().optional(),
  })).max(60),
  labourMinutesPerUnit: z.number().min(0).max(100000),
  cricutMinutesPerUnit: z.number().min(0).max(100000),
  estimatedTimeMinutes: z.number().min(0).max(100000).nullable().optional(),
  steps: z.array(z.string().max(500)).max(40).optional(),
});

// Test hook — delegates to the shared LLM transport stub so the analyser and
// the document enricher can be stubbed independently (or together).
export function __setLlmAnalyze(fn) { __setLlmCall(fn); }

const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

// ── Rule engine ────────────────────────────────────────────────────────────

const UNIT_MAP = [
  [/^sheets?$/i, 'sheet'], [/^meters?|metres?|^m$/i, 'meter'], [/^sticks?$/i, 'stick'],
  [/^rolls?$/i, 'roll'], [/^pieces?|pcs?|^pc$|^units?$/i, 'piece'], [/^mls?|^ml$/i, 'ml'],
  [/^grams?|^g$/i, 'gram'],
];
const toUnit = (raw) => {
  const s = String(raw || '').trim();
  for (const [re, u] of UNIT_MAP) if (re.test(s)) return u;
  return null;
};

const COLOURS = ['blush', 'sage', 'ivory', 'white', 'pink', 'red', 'blue', 'green', 'gold', 'silver', 'purple', 'lilac', 'yellow', 'orange', 'cream', 'black', 'eucalyptus', 'dusty pink', 'navy', 'teal'];
const pickColour = (name) => COLOURS.find((c) => name.toLowerCase().includes(c)) || null;

function parseMaterialLine(line) {
  const text = line.replace(/^[-*•]\s*/, '').trim();
  if (!text || text.length > 240) return null;
  let qty = null; let unit = null; let name = null;

  // "5 sheets 65lb cardstock" / "5 sheets of cardstock"
  let m = text.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s+(?:of\s+)?(.+)$/);
  if (m && toUnit(m[2])) { qty = Number(m[1]); unit = toUnit(m[2]); name = m[3].trim(); }
  // "65lb cardstock — 5 sheets" / "65lb cardstock - 5 sheets"
  if (!qty) {
    m = text.match(/^(.+?)\s*[—–-]\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);
    if (m && toUnit(m[3])) { name = m[1].trim(); qty = Number(m[2]); unit = toUnit(m[3]); }
  }
  // "65lb cardstock × 5" / "glue stick x 2"
  if (!qty) {
    m = text.match(/^(.+?)\s*[×x]\s*(\d+(?:\.\d+)?)$/);
    if (m) { name = m[1].trim(); qty = Number(m[2]); unit = 'piece'; }
  }
  if (!qty || !name || name.length < 2) return null;

  const weight = name.match(/(\d+(?:\.\d+)?)\s*(lb|gsm)/i);
  const size = name.match(/\b(A[0-6]|12\s?x\s?12\s?in|[0-9]+\s?x\s?[0-9]+\s?(?:in|cm|mm))\b/i);
  return {
    name: clip(name, 200),
    unit,
    qtyPerUnit: qty,
    wasteFactor: 0.05,
    colour: pickColour(name),
    weightValue: weight ? Number(weight[1]) : null,
    weightUnit: weight ? String(weight[2]).toLowerCase() : null,
    size: size ? clip(size[1], 40) : null,
  };
}

function findSections(text, headerRe) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  let grabbing = false;
  for (const line of lines) {
    if (headerRe.test(line)) { grabbing = true; continue; }
    if (grabbing && /^\s*(?:#{1,4}\s|step\s+\d|[A-Z][A-Za-z ]{2,30}:)/.test(line) && !/^\s*[-*•]/.test(line)) grabbing = false;
    if (grabbing && line.trim()) out.push(line.trim());
  }
  return out;
}

export function analyzeWithRules(rawText, sourceName = '') {
  const text = String(rawText || '');
  const lower = text.toLowerCase();
  const hasMaterials = /materials|you will need|supplies|ingredients/.test(lower);
  const hasSteps = /steps|method|instructions|directions|how to/.test(lower);
  const hasTime = /\d+\s*(?:-|–)?\s*(?:min(?:ute)?s?|hours?|hrs?)\b/i.test(text);
  const hasCraft = /fold|cut|glue|cricut|petal|stem|bouquet|assemble|cardstock|origami/.test(lower);
  const score = [hasMaterials, hasSteps, hasTime, hasCraft].filter(Boolean).length;
  const isProcedure = score >= 2;

  const titleLine = (text.match(/^#\s+(.+)$/m) || text.match(/^title:\s*(.+)$/mi) || [])[1]
    || String(sourceName || '').replace(/\.[^.]+$/, '') || 'Untitled procedure';

  const materialLines = findSections(text, /^\s*(?:#{1,4}\s*)?(?:materials|you will need|supplies|ingredients)\b/i);
  const materials = materialLines.map(parseMaterialLine).filter(Boolean);

  const timeM = text.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to\s+)?(\d+(?:\.\d+)?)?\s*(min(?:ute)?s?|hours?|hrs?)/i);
  let labourMinutesPerUnit = 25;
  if (timeM) {
    const val = Number(timeM[1]);
    labourMinutesPerUnit = /hour|hr/i.test(timeM[3]) ? Math.round(val * 60) : Math.round(val);
  }
  const cricutMinutesPerUnit = /cricut|cutting machine/i.test(lower) ? 8 : 0;

  // Two-axis taxonomy: category = what it is, subcategory = how it's made.
  const category = /manufactur|specification|\bspec\b|tolerance/i.test(lower) ? 'MANUFACTURING_SPEC'
    : /bouquet|arrangement/i.test(lower) ? 'BOUQUET'
    : /foliage|\bleaf\b|leaves|eucalyptus/i.test(lower) && !/flower|bloom|petal/i.test(lower) ? 'FOLIAGE'
    : /packag|carton|cello/i.test(lower) ? 'PACKAGING'
    : /sculptur|\bcrane\b|mobile|decor/i.test(lower) ? 'DECOR'
    : 'FLOWER';
  const subcategory = /origami|fold/i.test(lower) ? 'ORIGAMI'
    : /die.?cut|die set/i.test(lower) ? 'DIE_CUT'
    : /sculptur|wire frame/i.test(lower) ? 'SCULPTURAL'
    : /crepe|petal|\bcup\b|curl/i.test(lower) ? 'CREPE_PAPER'
    : 'HAND_ASSEMBLY';

  return {
    isProcedure,
    confidence: Math.min(0.9, 0.35 + 0.15 * score + (materials.length ? 0.15 : 0)),
    title: clip(titleLine, 200),
    category,
    subcategory,
    sku: (text.match(/\bsku[:\s]+([A-Za-z0-9_-]{2,50})/i) || [])[1] || null,
    description: null,
    materials,
    labourMinutesPerUnit: Math.min(100000, labourMinutesPerUnit),
    cricutMinutesPerUnit,
    estimatedTimeMinutes: labourMinutesPerUnit || null,
    steps: findSections(text, /^\s*(?:#{1,4}\s*)?(?:steps|method|instructions|directions)\b/i).slice(0, 40).map((s) => clip(s, 500)),
  };
}

// ── LLM engine ─────────────────────────────────────────────────────────────

const LLM_SYSTEM = `You are a data-extraction assistant for a paper-flower studio's manufacturing specs.
Extract a procedure from the document text and reply with ONLY a JSON object (no prose, no code fences):
{"isProcedure": boolean, "confidence": 0-1, "title": string, "category": "FLOWER"|"BOUQUET"|"FOLIAGE"|"DECOR"|"PACKAGING"|"MANUFACTURING_SPEC", "subcategory": "ORIGAMI"|"CREPE_PAPER"|"DIE_CUT"|"SCULPTURAL"|"HAND_ASSEMBLY"|null,
 "sku": string|null, "description": string|null,
 "materials": [{"name": string, "spec": string|null, "unit": "sheet"|"meter"|"stick"|"roll"|"piece"|"ml"|"gram",
   "qtyPerUnit": number, "wasteFactor": number, "estimatedCostPerUnit": number|null,
   "colour": string|null, "weightValue": number|null, "weightUnit": "lb"|"gsm"|null, "size": string|null, "brand": string|null}],
 "labourMinutesPerUnit": number, "cricutMinutesPerUnit": number, "estimatedTimeMinutes": number|null, "steps": [string]}
Rules: materials are per finished unit; use "piece" when no unit fits; estimatedCostPerUnit is AUD per material unit (null if unknown);
labourMinutesPerUnit is hands-on craft time per unit; cricutMinutesPerUnit is machine-cut time (0 if no Cricut);
isProcedure=false with a short confidence when the text is not a manufacturing procedure.`;

async function analyzeWithLlm(text, sourceName) {
  const body = `${sourceName ? `Source file: ${sourceName}\n\n` : ''}${text.slice(0, 40000)}`;
  const json = await llmJson({
    system: LLM_SYSTEM,
    user: body,
    maxTokens: 4000,
    session: `krystal-import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    userAgent: 'krystal-procedure-analyzer/1.0',
  });
  return analysisSchema.parse(json);
}

/**
 * Analyse extracted document text. Prefers the LLM when configured (or
 * stubbed); rules otherwise. Throws only when both engines fail hard.
 * @returns {Promise<{analysis: object, engine: 'llm'|'rules'}>}
 */
export async function analyzeProcedure(rawText, sourceName = '') {
  const canLlm = llmAvailable();
  if (canLlm) {
    try {
      return { analysis: await analyzeWithLlm(rawText, sourceName), engine: 'llm' };
    } catch (e) {
      console.warn(JSON.stringify({ level: 'warn', msg: 'llm procedure analysis failed, falling back to rules', err: e?.message }));
    }
  }
  return { analysis: analysisSchema.parse(analyzeWithRules(rawText, sourceName)), engine: 'rules' };
}

// ── Material matching ──────────────────────────────────────────────────────

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => new Set(norm(s).split(' ').filter((t) => t.length > 1));

function matchScore(candidate, material) {
  const a = tokens(candidate.name); const b = tokens(material.name);
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of b) if (a.has(t)) inter += 1;
  let score = inter / Math.max(a.size, b.size);
  if (material.colour && candidate.colour && norm(material.colour) === norm(candidate.colour)) score += 0.15;
  if (material.weightValue && candidate.weightValue === material.weightValue) score += 0.15;
  if (material.size && candidate.size && norm(material.size) === norm(candidate.size)) score += 0.1;
  if (material.brand && candidate.brand && norm(material.brand) === norm(candidate.brand)) score += 0.1;
  return Math.min(1, score);
}

/**
 * Build the material plan: each extracted material is either `reuse` (matched
 * an existing RawMaterial) or `create` (new profile proposed).
 */
export async function matchMaterials(materials) {
  const existing = await prisma.rawMaterial.findMany({
    select: { id: true, sku: true, name: true, unit: true, costPerUnit: true, colour: true, weightValue: true, weightUnit: true, size: true, brand: true },
  });
  return (materials || []).map((mat) => {
    let best = null; let bestScore = 0;
    for (const cand of existing) {
      const s = (norm(cand.sku) === norm(mat.name) ? 1 : 0) || matchScore(cand, mat);
      if (s > bestScore) { bestScore = s; best = cand; }
    }
    const reuse = bestScore >= 0.72 && best;
    return {
      ...mat,
      action: reuse ? 'reuse' : 'create',
      rawMaterialId: reuse ? best.id : null,
      matchedName: reuse ? best.name : null,
      matchedScore: Math.round(bestScore * 100) / 100,
      costPerUnit: reuse ? Number(best.costPerUnit) : (mat.estimatedCostPerUnit ?? 0),
    };
  });
}

// ── Pricing snapshot (bomPricing math) ─────────────────────────────────────

export function priceProposal(materialPlan, labourMinutesPerUnit, cricutMinutesPerUnit, cfg) {
  const labourPerHour = cfg?.labourPerHour ?? 55;
  const margin = cfg?.margin ?? 1.3;
  let materialsCost = 0;
  for (const l of materialPlan || []) {
    materialsCost += Number(l.qtyPerUnit || 0) * (1 + Number(l.wasteFactor || 0)) * Number(l.costPerUnit || 0);
  }
  const labourMinutes = Math.round((Number(labourMinutesPerUnit) || 0) + (Number(cricutMinutesPerUnit) || 0));
  const withLabour = Math.round((materialsCost + (labourMinutes * labourPerHour) / 60) * 100) / 100;
  // retail derives from the rounded withLabour so the snapshot is
  // self-consistent (review UI recomputes the same way)
  const retail = Math.round(withLabour * margin * 100) / 100;
  return {
    materialsCost: Math.round(materialsCost * 100) / 100,
    labourMinutes,
    withLabour,
    margin, labourPerHour, retail,
  };
}

/** Full pipeline used by the analyze route. */
export async function analyzeAndPlan(rawText, sourceName = '') {
  const { analysis, engine } = await analyzeProcedure(rawText, sourceName);
  const materialPlan = await matchMaterials(analysis.materials);
  const cfg = await pricingConfig().catch(() => ({}));
  const pricing = priceProposal(materialPlan, analysis.labourMinutesPerUnit, analysis.cricutMinutesPerUnit, cfg);
  return { analysis, engine, materialPlan, pricing };
}
