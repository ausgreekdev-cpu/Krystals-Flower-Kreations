// Document auto-enrichment (S3) — one cheap LLM call per upload.
//
// Turns a filename + extracted text into studio metadata: a real title,
// the right category, useful tags, and the supplier / invoice references.
// Everything is advisory and overridable in the UI.
//
// Policy (deliberate, documented in AGENTS.md):
// - category + tags are always applied when the model is confident
// - the title is only replaced while it is still the raw filename guess
// - the supplier link is only set on a confident match against the suppliers
//   table (never a fuzzy guess that could link the wrong vendor)
// - no LLM key → today's filename heuristics, nothing changes
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { llmJson, llmAvailable } from './llm.js';

const CATEGORIES = ['STOCKTAKE', 'SUPPLIER', 'INVOICE', 'PROCEDURE', 'EXPORT', 'MEDIA', 'OTHER'];

const enrichmentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.enum(CATEGORIES),
  tags: z.array(z.string().trim().min(1).max(32)).max(8).default([]),
  supplierName: z.string().trim().max(120).nullable().optional(),
  invoiceNumber: z.string().trim().max(60).nullable().optional(),
  invoiceDate: z.string().trim().max(40).nullable().optional(),
});

const SYSTEM = `You tidy up scanned business documents for a Perth paper-flower studio.
Read the document and reply with ONLY a JSON object:
{"title": string, "category": "STOCKTAKE"|"SUPPLIER"|"INVOICE"|"PROCEDURE"|"EXPORT"|"MEDIA"|"OTHER",
 "tags": [string], "supplierName": string|null, "invoiceNumber": string|null, "invoiceDate": string|null}
Rules: title = what the document actually is (e.g. "Canson cardstock invoice — March"), never the raw filename;
tags = short lowercase keywords (material, process, supplier, period) with no duplicates;
supplierName = the trading name of the supplier only if the document states one; invoiceNumber / invoiceDate only if present.`;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Only a confident supplier match links a document to a supplier.
export async function matchSupplier(name) {
  if (!name) return null;
  const target = norm(name);
  if (!target) return null;
  const suppliers = await prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  let best = null;
  for (const s of suppliers) {
    const n = norm(s.name);
    if (!n) continue;
    if (n === target || (target.includes(n) && n.length >= 4) || (n.includes(target) && target.length >= 4)) {
      if (!best || n.length > norm(best.name).length) best = s;
    }
  }
  return best ? best.id : null;
}

/**
 * Suggest metadata for a document.
 * @param {object} doc { title, originalName, extractedText, category, kind }
 * @returns {Promise<null | { title, category, tags, supplierId, invoiceNumber, invoiceDate, engine: 'llm' }>}
 */
export async function enrichDocument(doc) {
  const text = String(doc?.extractedText || '').trim();
  if (!llmAvailable()) return null;
  if (text.length < 40) return null; // nothing to read — don't spend a call

  const user = `${doc.originalName ? `File: ${doc.originalName}\n\n` : ''}${text.slice(0, 12000)}`;
  let parsed;
  try {
    parsed = enrichmentSchema.parse(await llmJson({
      system: SYSTEM,
      user,
      maxTokens: 800,
      session: `krystal-enrich-${doc.id || Date.now().toString(36)}`,
      userAgent: 'krystal-document-enricher/1.0',
    }));
  } catch (e) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'document enrichment failed', err: e?.message }));
    return null;
  }

  const tags = [...new Set(parsed.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
  const supplierId = await matchSupplier(parsed.supplierName).catch(() => null);
  return {
    title: parsed.title,
    category: parsed.category,
    tags,
    supplierId,
    invoiceNumber: parsed.invoiceNumber || null,
    invoiceDate: parsed.invoiceDate || null,
    engine: 'llm',
  };
}
