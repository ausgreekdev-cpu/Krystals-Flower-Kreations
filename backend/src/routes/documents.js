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
import { uploadBusinessDocs, docMimeLooksReal } from '../middleware/upload.js';
import { putObject, getObject, deleteObjectByUrl } from '../services/storage.js';
import { ocrImage } from '../services/ocr.js';
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
const ocrLimit = rateLimit('document_ocr', 10, 10);

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
    ] } : {}),
  };
  const [total, documents] = await Promise.all([
    prisma.businessDocument.count({ where }),
    prisma.businessDocument.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, select: META_SELECT }),
  ]);
  res.json({ documents, total, page, pages: Math.max(1, Math.ceil(total / limit)), limit });
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

// ── Upload (Editor+): sniff → sha256 dedup → auto-categorise → extract → thumb ─
router.post('/', authenticate, requireRole(...EDITOR_ROLES), uploadLimit, uploadBusinessDocs.single('file'), asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file || !file.buffer?.length) return res.status(400).json({ error: 'No file', code: 'validation_failed' });
  const mime = file.mimetype || 'application/octet-stream';
  const kind = kindFor(mime, file.originalname);
  if (!looksReal(kind, mime, file.buffer)) {
    return res.status(415).json({ error: `${file.originalname} does not look like a valid ${kind === 'OTHER' ? mime : kind} file`, code: 'unsupported_media_type' });
  }

  // Dedup: identical bytes reuse the existing active row (no second object).
  // Rows uploaded before M2 may lack extractedText/thumbRef — backfill them.
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const existing = await prisma.businessDocument.findFirst({ where: { sha256, deletedAt: null } });
  if (existing) {
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
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'document_upload', entityType: 'business_document', entityId: row.id, details: { originalName: row.originalName, kind, category: row.category, sizeBytes: row.sizeBytes } });
  res.status(201).json({ document: row, deduped: false });
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
  let text = null; let confidence = null;
  if (doc.kind === 'PDF') {
    text = await extractText('PDF', buf); // retry unpdf (transient upload-time failure)
    if (!text) {
      return res.status(422).json({
        error: 'This PDF has no text layer. Export its pages as images (PNG/JPG) and upload those — images are OCRable.',
        code: 'no_text_layer',
      });
    }
  } else {
    const out = await ocrImage(buf);
    text = clip(out.text);
    confidence = out.confidence;
    if (!text) return res.status(422).json({ error: 'OCR found no readable text in this image', code: 'no_text_found' });
  }
  const updated = await prisma.businessDocument.update({ where: { id }, data: { extractedText: text } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'document_ocr', entityType: 'business_document', entityId: id, details: { chars: text.length, confidence, kind: doc.kind } });
  res.json({ document: updated, ocr: { chars: text.length, confidence } });
}));

export default router;
