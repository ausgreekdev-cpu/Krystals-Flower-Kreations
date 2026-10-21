import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import sharp from 'sharp';
import { extractText as pdfExtractText, getDocumentProxy } from 'unpdf';
import * as XLSX from 'xlsx';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { uploadBusinessDocs, uploadDocPages, docMimeLooksReal } from '../middleware/upload.js';
import { putObject, getObject, deleteObjectByUrl } from '../services/storage.js';
import { ocrImage, prepareForOcrReport } from '../services/ocr.js';
import { enrichDocument } from '../services/documentEnricher.js';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { rateLimit } from '../middleware/rate-limit.js';
import { audit } from '../lib/audit.js';

// Business document upload centre — private-bucket storage for stocktakes,
// supplier docs, exports and scans. Editor+ only (nothing here is public:
// bytes may hold PII and cost data), served back through the authed
// GET /:id/file route, never through a public URL.
const router = Router();

const EDITOR_ROLES = ['admin', 'developer', 'maker', 'staff'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ['PDF', 'CSV', 'SPREADSHEET', 'IMAGE', 'MARKDOWN', 'TEXT', 'OTHER'];
const CATEGORIES = ['STOCKTAKE', 'SUPPLIER', 'INVOICE', 'PROCEDURE', 'EXPORT', 'MEDIA', 'OTHER'];
const META_SELECT = {
  id: true, title: true, originalName: true, mime: true, sizeBytes: true, sha256: true,
  kind: true, category: true, tags: true, linkedSupplierId: true, linkedProcedureId: true,
  uploadedById: true, thumbRef: true, createdAt: true, updatedAt: true,
};

const uploadLimit = rateLimit('document_upload', 30, 5);
const downloadLimit = rateLimit('document_download', 60, 1);
const thumbLimit = rateLimit('document_thumb', 120, 5);
const ocrLimit = rateLimit('document_ocr', 60, 10);
const assembleLimit = rateLimit('document_assemble', 20, 10); // batch OCR queues run sequentially

function kindFor(mime, name) {
  const m = String(mime || '').toLowerCase();
  const n = String(name || '');
  if (m === 'application/pdf' || /\.pdf$/i.test(n)) return 'PDF';
  if (m === 'text/csv' || m === 'application/csv' || m === 'text/tab-separated-values' || /\.(csv|tsv)$/i.test(n)) return 'CSV';
  if (m.includes('spreadsheet') || m === 'application/vnd.ms-excel' || /\.(xlsx|xls)$/i.test(n)) return 'SPREADSHEET';
  if (m.startsWith('image/')) return 'IMAGE';
  if (m === 'text/markdown' || /\.md$/i.test(n)) return 'MARKDOWN';
  if (m.startsWith('text/') || m === 'application/json' || /\.(txt|json)$/i.test(n)) return 'TEXT';
  return 'OTHER';
}

// Content sniff beyond docMimeLooksReal: spreadsheets are zip/OLE2 containers
// and text-ish kinds must be NUL-free UTF-8-ish bytes (defends against a
// client claiming text/csv while uploading a binary).
function looksReal(kind, mime, buffer) {
  if (kind === 'SPREADSHEET') {
    if (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) return true; // xlsx (zip)
    if (buffer.length > 8 && buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) return true; // legacy xls (OLE2)
    return false;
  }
  if (kind === 'CSV' || kind === 'TEXT' || kind === 'MARKDOWN') {
    return buffer.length > 0 && !buffer.subarray(0, 4096).includes(0);
  }
  if (kind === 'OTHER') return docMimeLooksReal(buffer, mime);
  return docMimeLooksReal(buffer, mime);
}

function extFor(mime, name) {
  const byMime = {
    'application/pdf': 'pdf', 'text/csv': 'csv', 'text/tab-separated-values': 'tsv',
    'text/plain': 'txt', 'text/markdown': 'md', 'application/json': 'json',
    'application/zip': 'zip', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
    'image/gif': 'gif', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/quicktime': 'mov',
    'model/stl': 'stl', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xls',
  };
  if (byMime[mime]) return byMime[mime];
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : 'bin';
}

// Raster photos/scans go through sharp (decode = the real content check);
// everything else is stored raw after the sniff above.
async function prepareImage(mime, buffer) {
  try {
    const img = sharp(buffer);
    const meta = await img.metadata();
    let p = img.rotate();
    if (meta.width > 1600 || meta.height > 1600) p = p.resize({ width: 1600, height: 1600, fit: 'inside' });
    const out = await p.jpeg({ quality: 82 }).toBuffer();
    return { buf: out, mime: 'image/jpeg', ext: 'jpg' };
  } catch {
    throw Object.assign(new Error('Image could not be decoded'), { status: 415, code: 'unsupported_media_type', expose: true });
  }
}

function asciiFilename(name) {
  return String(name || 'file').replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
}

// M2: guess the category from the filename (admin can still edit per-row).
// Order matters — the most specific business keywords win, IMAGE kind is the
// MEDIA fallback rather than the first rule.
function categoryFor(name, kind) {
  const n = String(name || '').toLowerCase();
  if (/stocktake|stock-take|stock_take|inventory|cycle.?count/.test(n)) return 'STOCKTAKE';
  if (/invoice|tax.?invoice|receipt|\bbill\b/.test(n)) return 'INVOICE';
  if (/supplier|vendor|provider/.test(n)) return 'SUPPLIER';
  if (/procedure|\bsop\b|guide|how-?to|spec(?:ification)?|\bprocess\b/.test(n)) return 'PROCEDURE';
  if (/export|backup|\bdump\b|snapshot/.test(n)) return 'EXPORT';
  if (kind === 'IMAGE' || /photo|scan|image|picture|logo/.test(n)) return 'MEDIA';
  return 'OTHER';
}

// M2+M3: searchable text. CSV/MD/TXT are utf8 slices; PDF full-text via unpdf
// (pdf.js, node≥20-safe pin — 1.8.x demands node 22); XLSX/XLS via SheetJS
// (0.20.3 from cdn.sheetjs.com — npm's 0.18.5 has an unpatched prototype-
// pollution CVE). Encrypted/corrupt PDFs and unreadable sheets → null (image-
// only scans are M4 OCR territory). Everything clipped to EXTRACT_CAP.
const EXTRACT_CAP = 256 * 1024; // 256KB of text per doc is plenty for search
function clip(text) {
  const t = String(text || '').trim();
  return t ? t.slice(0, EXTRACT_CAP) : null;
}
async function extractPdfTextBuf(buffer) {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await pdfExtractText(pdf, { mergePages: true });
    return clip(text);
  } catch {
    return null;
  }
}
function extractSheetBuf(buffer) {
  try {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const parts = [];
    for (const name of wb.SheetNames.slice(0, 5)) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      if (csv.trim()) parts.push(`# ${name}\n${csv}`);
    }
    return clip(parts.join('\n'));
  } catch {
    return null;
  }
}
async function extractText(kind, buffer) {
  if (!buffer.length) return null;
  if (['CSV', 'MARKDOWN', 'TEXT'].includes(kind)) return clip(buffer.subarray(0, EXTRACT_CAP).toString('utf8'));
  if (kind === 'PDF') return extractPdfTextBuf(buffer);
  if (kind === 'SPREADSHEET') return extractSheetBuf(buffer);
  return null;
}

// M2: 160px webp preview for raster images (gif → first frame). SVG skipped.
const THUMB_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
async function makeThumb(buffer) {
  try {
    return await sharp(buffer).rotate().resize(160, 160, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
  } catch {
    return null; // thumbnail is best-effort — never block the upload
  }
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  category: z.enum(['STOCKTAKE', 'SUPPLIER', 'INVOICE', 'PROCEDURE', 'EXPORT', 'MEDIA', 'OTHER']).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
  linkedSupplierId: z.string().uuid().nullable().optional(),
  linkedProcedureId: z.string().uuid().nullable().optional(),
  // OCR drawer edits the extracted text directly (256KB cap matches EXTRACT_CAP).
  extractedText: z.string().max(262144).nullable().optional(),
});

// ── List (Editor+): search over title/name/tags + kind/category filters ─────
router.get('/', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const kind = KINDS.includes(req.query.kind) ? req.query.kind : undefined;
  const category = CATEGORIES.includes(req.query.category) ? req.query.category : undefined;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const where = {
    deletedAt: null,
    ...(kind ? { kind } : {}),
    ...(category ? { category } : {}),
    ...(q ? { OR: [
      { title: { contains: q, mode: 'insensitive' } },
      { originalName: { contains: q, mode: 'insensitive' } },
      { tags: { has: q.toLowerCase() } },
      { extractedText: { contains: q, mode: 'insensitive' } },
      { invoiceNumber: { contains: q, mode: 'insensitive' } },
    ] } : {}),
  };
  const [total, documents] = await Promise.all([
    prisma.businessDocument.count({ where }),
    prisma.businessDocument.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, select: META_SELECT }),
  ]);
  // hasText (without shipping extractedText in the list): second tiny query.
  const withText = await prisma.businessDocument.findMany({
    where: { id: { in: documents.map((d) => d.id) }, extractedText: { not: null } },
    select: { id: true },
  });
  const textIds = new Set(withText.map((d) => d.id));
  res.json({ documents: documents.map((d) => ({ ...d, hasText: textIds.has(d.id) })), total, page, pages: Math.max(1, Math.ceil(total / limit)), limit });
}));

// ── Detail (Editor+) ─────────────────────────────────────────────────────────
router.get('/:id', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const doc = await prisma.businessDocument.findFirst({ where: { id, deletedAt: null } });
  if (!doc) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  res.json(doc);
}));

// ── Download (Editor+): the ONLY way bytes leave the private bucket ─────────
router.get('/:id/file', authenticate, requireRole(...EDITOR_ROLES), downloadLimit, asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const doc = await prisma.businessDocument.findFirst({ where: { id, deletedAt: null } });
  if (!doc) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const buf = await getObject(doc.storageRef);
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'document_download', entityType: 'business_document', entityId: doc.id, details: { originalName: doc.originalName } });
  res.setHeader('Content-Type', doc.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${asciiFilename(doc.originalName)}"; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buf);
}));

// ── Thumbnail (Editor+): 160px webp preview generated at upload (M2) ────────
router.get('/:id/thumb', authenticate, requireRole(...EDITOR_ROLES), thumbLimit, asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const doc = await prisma.businessDocument.findFirst({ where: { id, deletedAt: null } });
  if (!doc) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  if (!doc.thumbRef) return res.status(404).json({ error: 'No thumbnail', code: 'not_found' });
  const buf = await getObject(doc.thumbRef);
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(buf);
}));

// ── Assemble scanned pages into ONE PDF document (multi-page scans) ─────────
// Receives the captured pages as multipart files, OCRs each page, and stores a
// single PDF (private bucket) whose text is the concatenation of the pages.
// Word boxes keep their page index so the searchable-PDF export can overlay
// an invisible text layer per page.
router.post('/assemble', authenticate, requireRole(...EDITOR_ROLES), assembleLimit, uploadDocPages.array('files', 20), asyncHandler(async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) return res.status(400).json({ error: 'No pages uploaded', code: 'validation_failed' });
  if (files.length > 20) return res.status(400).json({ error: 'Maximum 20 pages per document', code: 'validation_failed' });
  const totalBytes = files.reduce((a, f) => a + (f.size || 0), 0);
  if (totalBytes > 5 * 1024 * 1024) {
    return res.status(413).json({ error: 'Combined pages too large (5MB max) — scan fewer pages or lower the capture resolution', code: 'file_too_large' });
  }

  const title = String(req.body?.title || 'Scanned document').replace(/\.[^.]+$/, '').slice(0, 200) || 'Scanned document';

  // 1. normalise each page to a JPEG (alpha flattened, size capped)
  const pages = [];
  for (const [i, f] of files.entries()) {
    try {
      const buf = await sharp(f.buffer, { failOn: 'none' }).rotate()
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 }).toBuffer();
      pages.push({ buf });
    } catch {
      return res.status(415).json({ error: `Page ${i + 1} is not a readable image`, code: 'unsupported_media_type' });
    }
  }

  // 2. per-page OCR (words stay in the prepared image's pixel space)
  const ocrPages = [];
  let extracted = '';
  // Budget the per-page OCR: a 20-page scan must not outlive the function
  // timeout. Pages past the budget are stored without text (still in the PDF).
  const ocrDeadline = Date.now() + 15_000;
  for (const p of pages) {
    if (Date.now() > ocrDeadline) {
      ocrPages.push({ w: 0, h: 0, words: [], conf: 0, skipped: true });
      continue;
    }
    try {
      const out = await ocrImage(p.buf, { timeoutMs: 12_000 });
      if (out.text) extracted += (extracted ? '\n\n' : '') + out.text;
      ocrPages.push({ w: out.width || 0, h: out.height || 0, words: out.words || [], conf: Number(out.confidence) || 0 });
    } catch (e) {
      console.warn(JSON.stringify({ level: 'warn', msg: 'page OCR failed during assemble', err: e?.message }));
      ocrPages.push({ w: 0, h: 0, words: [], conf: 0 });
    }
  }

  // 3. assemble the PDF (A4 width, page height from each image's aspect)
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator('Krystals Flower Creations');
  for (const p of pages) {
    const img = await pdf.embedJpg(p.buf);
    const w = 595;
    const h = Math.max(1, Math.round((img.height / img.width) * w));
    const page = pdf.addPage([w, h]);
    page.drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  const pdfBytes = Buffer.from(await pdf.save());

  // 4. store (private bucket) + one document row
  const sha256 = crypto.createHash('sha256').update(pdfBytes).digest('hex');
  const existing = await prisma.businessDocument.findFirst({ where: { sha256, deletedAt: null } });
  if (existing) return res.status(200).json({ document: existing, deduped: true });

  const key = `docs/${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.pdf`;
  const storageRef = await putObject(key, pdfBytes, 'application/pdf', { bucket: 'business-documents' });
  let thumbRef = null;
  const tbuf = await makeThumb(pages[0].buf);
  if (tbuf) {
    await putObject(key.replace(/\.pdf$/, '-thumb.webp'), tbuf, 'image/webp', { bucket: 'business-documents' });
    thumbRef = `business-documents/${key.replace(/\.pdf$/, '-thumb.webp')}`;
  }
  const confAvg = ocrPages.length
    ? Math.round(ocrPages.reduce((a, p) => a + p.conf, 0) / ocrPages.length)
    : null;
  const row = await prisma.businessDocument.create({
    data: {
      title,
      originalName: `${title}.pdf`.slice(0, 255),
      mime: 'application/pdf',
      sizeBytes: pdfBytes.length,
      storageRef,
      sha256,
      kind: 'PDF',
      category: categoryFor(`${title}.pdf`, 'PDF'),
      extractedText: clip(extracted),
      ocrWords: { pages: ocrPages.map((p, i) => ({ pageIndex: i, w: p.w, h: p.h, words: p.words })) },
      ocrConfidence: confAvg,
      ocrAt: new Date(),
      thumbRef,
      uploadedById: req.user.id,
    },
  });
  audit({
    actorId: req.user.id, actorEmail: req.user.email, action: 'document_assemble', entityType: 'business_document', entityId: row.id,
    details: { title, pages: pages.length, chars: extracted.length, confidence: confAvg },
  });
  res.status(201).json({ document: row, deduped: false, pages: pages.length });
}));

// ── "What OCR sees" (Editor+): the exact prepared image ─────────────────────
// Same bytes the engine sees (deskewed, greyscaled, normalised, sharpened,
// upscaled) — the drawer shows this instead of an approximation. X-Skew-Angle
// reports the deskew correction applied. Image documents only: this sharp
// build cannot rasterize PDFs (their OCR reads the text layer).
router.get('/:id/preprocessed', authenticate, requireRole(...EDITOR_ROLES), thumbLimit, asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const doc = await prisma.businessDocument.findFirst({ where: { id, deletedAt: null } });
  if (!doc) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  if (doc.kind !== 'IMAGE') {
    return res.status(422).json({ error: 'Preprocessing preview is for image documents — PDFs are read from their text layer', code: 'unsupported_media_type' });
  }
  const buf = await getObject(doc.storageRef);
  const { data, angle } = await prepareForOcrReport(buf);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('X-Skew-Angle', String(angle));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.send(data);
}));

// ── Upload (Editor+): sniff → sha256 dedup → auto-categorise → extract → thumb ─
router.post('/', authenticate, requireRole(...EDITOR_ROLES), uploadLimit, uploadBusinessDocs.single('file'), asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file || !file.buffer?.length) return res.status(400).json({ error: 'No file', code: 'validation_failed' });
  const mime = file.mimetype || 'application/octet-stream';
  const kind = kindFor(mime, file.originalname);
  if (!looksReal(kind, mime, file.buffer)) {
    return res.status(415).json({ error: `${file.originalname} does not look like a valid ${kind === 'OTHER' ? mime : kind} file`, code: 'unsupported_media_type' });
  }

  // Exact-duplicate handling (sha256): identical bytes never silently become
  // two rows. `on_duplicate` decides — reuse (default for API/scripts),
  // ask (UI: 409 + both sides, nothing stored), replace (existing row adopts
  // the incoming name/title), keep_new (existing row + bytes removed, fresh
  // row stored), skip (discard the incoming upload).
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const existing = await prisma.businessDocument.findFirst({ where: { sha256, deletedAt: null } });
  const onDuplicate = String(req.body?.on_duplicate || 'reuse');
  if (!['reuse', 'ask', 'replace', 'keep_new', 'skip'].includes(onDuplicate)) {
    return res.status(400).json({ error: 'on_duplicate must be reuse|ask|replace|keep_new|skip', code: 'validation_failed' });
  }
  if (existing && onDuplicate === 'ask') {
    return res.status(409).json({
      error: `"${file.originalname}" is an exact duplicate of an existing document`,
      code: 'duplicate',
      existing,
      incoming: {
        originalName: String(file.originalname || '').slice(0, 255),
        sizeBytes: file.buffer.length,
        sha256, kind,
        category: categoryFor(file.originalname, kind),
      },
    });
  }
  if (existing && onDuplicate === 'skip') {
    return res.status(200).json({ document: existing, deduped: true, skipped: true });
  }
  if (existing && onDuplicate === 'keep_new') {
    // Mirror the delete route: bytes + thumb go away, row soft-deleted so the
    // audit trail survives; the incoming upload is then stored as a fresh row.
    await prisma.businessDocument.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await deleteObjectByUrl(existing.storageRef).catch(() => {});
    if (existing.thumbRef) await deleteObjectByUrl(existing.thumbRef).catch(() => {});
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'document_duplicate_replace', entityType: 'business_document', entityId: existing.id, details: { originalName: existing.originalName, decision: 'keep_new' } });
  } else if (existing && onDuplicate === 'replace') {
    // One record survives: the incoming file's identity wins, user-edited
    // fields (category/tags/links) are kept; missing text/thumbs backfilled.
    const patch = {
      originalName: String(file.originalname || existing.originalName).slice(0, 255),
      title: String(file.originalname || '').replace(/\.[^.]+$/, '').slice(0, 200) || existing.title,
    };
    if (!existing.extractedText) {
      const text = await extractText(kind, file.buffer);
      if (text) patch.extractedText = text;
    }
    if (!existing.thumbRef && kind === 'IMAGE' && THUMB_MIMES.has(mime)) {
      const tbuf = await makeThumb(file.buffer);
      if (tbuf) patch.thumbRef = await putObject(`docs/${existing.id}-thumb.webp`, tbuf, 'image/webp', { bucket: 'business-documents' });
    }
    const updated = await prisma.businessDocument.update({ where: { id: existing.id }, data: patch });
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'document_duplicate_replace', entityType: 'business_document', entityId: existing.id, details: { originalName: existing.originalName, decision: 'replace' } });
    return res.status(200).json({ document: updated, deduped: true, replaced: true });
  } else if (existing) {
    // reuse (default): identical bytes reuse the existing active row (no
    // second object). Rows uploaded before M2 may lack extractedText/thumbRef
    // — backfill them.
    const patch = {};
    if (!existing.extractedText) {
      const text = await extractText(kind, file.buffer);
      if (text) patch.extractedText = text;
    }
    if (!existing.thumbRef && kind === 'IMAGE' && THUMB_MIMES.has(mime)) {
      const tbuf = await makeThumb(file.buffer);
      if (tbuf) patch.thumbRef = await putObject(`docs/${existing.id}-thumb.webp`, tbuf, 'image/webp', { bucket: 'business-documents' });
    }
    if (Object.keys(patch).length) {
      const updated = await prisma.businessDocument.update({ where: { id: existing.id }, data: patch });
      return res.status(200).json({ document: updated, deduped: true });
    }
    return res.status(200).json({ document: existing, deduped: true });
  }

  let buf = file.buffer; let outMime = mime; let ext = extFor(mime, file.originalname);
  if (kind === 'IMAGE' && ['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
    const prepared = await prepareImage(mime, file.buffer);
    buf = prepared.buf; outMime = prepared.mime; ext = prepared.ext;
  }
  const key = `docs/${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const storageRef = await putObject(key, buf, outMime, { bucket: 'business-documents' });
  let thumbRef = null;
  if (kind === 'IMAGE' && THUMB_MIMES.has(mime)) {
    const tbuf = await makeThumb(file.buffer);
    if (tbuf) thumbRef = await putObject(key.replace(/\.[^.]+$/, '') + '-thumb.webp', tbuf, 'image/webp', { bucket: 'business-documents' });
  }
  const title = String(file.originalname || 'Untitled').replace(/\.[^.]+$/, '').slice(0, 200) || 'Untitled';
  const row = await prisma.businessDocument.create({
    data: {
      title, originalName: String(file.originalname || title).slice(0, 255), mime: outMime,
      sizeBytes: buf.length, storageRef, sha256, kind, category: categoryFor(file.originalname, kind),
      extractedText: await extractText(kind, file.buffer), thumbRef, uploadedById: req.user.id,
    },
  });
  // Auto-OCR images (S1): text + word boxes + confidence land on the record,
  // so search, confidence review and searchable-PDF export all have data with
  // no extra click. Never blocks the upload — failures are logged and ignored.
  if (kind === 'IMAGE' && outMime !== 'image/svg+xml') {
    try {
      const out = await ocrImage(buf, { timeoutMs: 15_000 });
      const text = clip(out.text);
      const ocrWords = out.words?.length
        ? { pages: [{ pageIndex: 0, w: out.width || 0, h: out.height || 0, words: out.words }] }
        : null;
      if (text || ocrWords) {
        await prisma.businessDocument.update({
          where: { id: row.id },
          data: { extractedText: text || row.extractedText, ocrConfidence: out.confidence, ocrAt: new Date(), ocrWords },
        });
        row.extractedText = text || row.extractedText;
        row.ocrConfidence = out.confidence;
        row.ocrAt = new Date();
        row.ocrWords = ocrWords;
      }
    } catch (e) {
      console.warn(JSON.stringify({ level: 'warn', msg: 'auto-ocr failed on upload', err: e?.message }));
    }
  }
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'document_upload', entityType: 'business_document', entityId: row.id, details: { originalName: row.originalName, kind, category: row.category, sizeBytes: row.sizeBytes } });
  res.status(201).json({ document: row, deduped: false });
}));

// ── Enrich metadata from the document text (S3) ─────────────────────────────
// Separate from the upload on purpose: the upload may already spend its
// budget on OCR (cold tesseract model download), so enrichment — one cheap
// LLM call — runs in its own request and never blocks the upload.
router.post('/:id/enrich', authenticate, requireRole(...EDITOR_ROLES), rateLimit('document_enrich', 30, 10), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const doc = await prisma.businessDocument.findFirst({ where: { id, deletedAt: null } });
  if (!doc) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const suggestion = await enrichDocument({
    id: doc.id, title: doc.title, originalName: doc.originalName,
    extractedText: doc.extractedText, category: doc.category, kind: doc.kind,
  });
  if (!suggestion) return res.status(200).json({ document: doc, enriched: null });
  const data = {
    category: suggestion.category,
    tags: suggestion.tags,
    invoiceNumber: suggestion.invoiceNumber,
    invoiceDate: suggestion.invoiceDate,
  };
  // only replace a title that is still the raw filename guess
  const guess = String(doc.originalName || '').replace(/\.[^.]+$/, '').slice(0, 200);
  if (doc.title === guess && suggestion.title) data.title = suggestion.title;
  if (suggestion.supplierId) data.linkedSupplierId = suggestion.supplierId;
  const updated = await prisma.businessDocument.update({ where: { id }, data });
  audit({
    actorId: req.user.id, actorEmail: req.user.email, action: 'document_enrich', entityType: 'business_document', entityId: id,
    details: { title: data.title ?? doc.title, category: data.category, tags: data.tags, supplierId: suggestion.supplierId || null },
  });
  res.json({ document: updated, enriched: { title: data.title ?? doc.title, category: data.category, tags: data.tags, supplierId: suggestion.supplierId || null } });
}));

// ── Searchable PDF export (Editor+): invisible text layer from OCR words ────
// Re-packages the scan with the recognised words painted at their bounding
// boxes (opacity 0) — same visual, Ctrl-F now works. Word boxes live in the
// PREPARED image's pixel space, so the export pages are built from that same
// prepared image (single scans) or map onto the assembled PDF's pages 1:1
// (both were produced from it). No word boxes → 422.
router.get('/:id/searchable.pdf', authenticate, requireRole(...EDITOR_ROLES), downloadLimit, asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const doc = await prisma.businessDocument.findFirst({ where: { id, deletedAt: null } });
  if (!doc) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const pages = doc.ocrWords && typeof doc.ocrWords === 'object' ? doc.ocrWords.pages : null;
  if (!Array.isArray(pages) || !pages.length) {
    return res.status(422).json({ error: 'No word boxes on this document — run OCR first (images and assembled scans)', code: 'no_word_boxes' });
  }

  const master = await getObject(doc.storageRef);
  let pdf;
  let targets = pages;
  if (doc.kind === 'PDF') {
    pdf = await PDFDocument.load(master);
  } else {
    // build a page from the exact prepared image the words came from
    const prepared = await prepareForOcrReport(master);
    pdf = await PDFDocument.create();
    pdf.setTitle(doc.title);
    const pw = 595;
    const meta = await sharp(prepared.data).metadata();
    const ph = Math.max(1, Math.round(((meta.height || 1) / (meta.width || 1)) * pw));
    const img = await pdf.embedPng(prepared.data);
    const page = pdf.addPage([pw, ph]);
    page.drawImage(img, { x: 0, y: 0, width: pw, height: ph });
    targets = [{ ...pages[0], w: meta.width || pages[0].w, h: meta.height || pages[0].h }];
  }

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let painted = 0;
  for (const pg of targets) {
    const page = pdf.getPage(pg.pageIndex);
    if (!page) continue;
    const { width: pw, height: ph } = page.getSize();
    const sx = pw / (pg.w || pw);
    const sy = ph / (pg.h || ph);
    for (const word of pg.words || []) {
      const size = Math.max(4, (Number(word.y1) - Number(word.y0)) * sy * 0.85);
      try {
        page.drawText(String(word.t), {
          x: Number(word.x0) * sx,
          y: ph - Number(word.y1) * sy, // image y grows down; PDF y grows up
          size, font, opacity: 0,
        });
        painted++;
      } catch { /* a malformed word box never blocks the export */ }
    }
  }

  const bytes = Buffer.from(await pdf.save());
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${asciiFilename(doc.title)}-searchable.pdf"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Words-Painted', String(painted));
  res.send(bytes);
}));

// ── Update metadata (Editor+): rename / categorise / tag / link ─────────────
router.patch('/:id', authenticate, requireRole(...EDITOR_ROLES), validate(patchSchema), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const doc = await prisma.businessDocument.findFirst({ where: { id, deletedAt: null } });
  if (!doc) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const body = req.validated;
  const data = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.category !== undefined) data.category = body.category;
  if (body.tags !== undefined) data.tags = [...new Set(body.tags.map((t) => t.toLowerCase()))];
  if (body.linkedSupplierId !== undefined) data.linkedSupplierId = body.linkedSupplierId;
  if (body.linkedProcedureId !== undefined) data.linkedProcedureId = body.linkedProcedureId;
  if (body.extractedText !== undefined) data.extractedText = body.extractedText;
  const updated = await prisma.businessDocument.update({ where: { id }, data });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'document_update', entityType: 'business_document', entityId: id, details: { fields: Object.keys(data) } });
  res.json(updated);
}));

// ── Delete (Editor+): soft-delete the row and remove the bytes ──────────────
router.delete('/:id', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const doc = await prisma.businessDocument.findFirst({ where: { id, deletedAt: null } });
  if (!doc) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  await prisma.businessDocument.update({ where: { id }, data: { deletedAt: new Date() } });
  await deleteObjectByUrl(doc.storageRef); // best-effort — PII should not linger
  if (doc.thumbRef) await deleteObjectByUrl(doc.thumbRef);
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'document_delete', entityType: 'business_document', entityId: id, details: { originalName: doc.originalName } });
  res.json({ id, deleted: true });
}));

// ── OCR (Editor+, M4): on-demand text recovery for scans ────────────────────
// Images go through tesseract.js (langdata cached in /tmp; ~10.9MB gz download
// on cold start — hence timeout_ms 26000 in netlify.toml). Text-less PDFs are
// NOT rendered (no pdf→image renderer in the function; mupdf would add ~14MB
// of wasm) — we retry unpdf once and return actionable guidance if the layer
// really is missing. ?force=1 re-runs even when extractedText already exists.
router.post('/:id/ocr', authenticate, requireRole(...EDITOR_ROLES), ocrLimit, asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const doc = await prisma.businessDocument.findFirst({ where: { id, deletedAt: null } });
  if (!doc) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const force = req.query.force === '1' || req.query.force === 'true';
  if (!['IMAGE', 'PDF'].includes(doc.kind)) {
    return res.status(415).json({ error: 'OCR supports images and PDFs only', code: 'unsupported_media_type' });
  }
  if (doc.mime === 'image/svg+xml') {
    return res.status(415).json({ error: 'SVG is vector text — download it instead of OCR', code: 'unsupported_media_type' });
  }
  if (doc.extractedText && !force) {
    return res.status(409).json({ error: 'Document already has extracted text — pass ?force=1 to re-run', code: 'conflict' });
  }
  const buf = await getObject(doc.storageRef);
  let text = null; let confidence = null; let ocrWords = null;
  if (doc.kind === 'PDF') {
    text = await extractText('PDF', buf); // retry unpdf (transient upload-time failure)
    if (!text) {
      return res.status(422).json({
        error: 'This PDF has no text layer. Export its pages as images (PNG/JPG) and upload those — images are OCRable.',
        code: 'no_text_layer',
      });
    }
  } else {
    const out = await ocrImage(buf, { timeoutMs: 25_000 });
    text = clip(out.text);
    confidence = out.confidence;
    if (out.words?.length) {
      ocrWords = { pages: [{ pageIndex: 0, w: out.width || 0, h: out.height || 0, words: out.words }] };
    }
    if (!text) return res.status(422).json({ error: 'OCR found no readable text in this image', code: 'no_text_found' });
  }
  const updated = await prisma.businessDocument.update({
    where: { id },
    data: { extractedText: text, ocrConfidence: confidence, ocrAt: new Date(), ocrWords },
  });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'document_ocr', entityType: 'business_document', entityId: id, details: { chars: text.length, confidence, kind: doc.kind } });
  res.json({ document: updated, ocr: { chars: text.length, confidence } });
}));

export default router;
