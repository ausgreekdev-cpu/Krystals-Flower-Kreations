import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole, verifyToken } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { uploadDocs, docMimeLooksReal } from '../middleware/upload.js';
import { putObject, deleteObjectByUrl } from '../services/storage.js';
import { audit } from '../lib/audit.js';
import sharp from 'sharp';

const router = Router();

// RBAC mapping: Editor = maker/staff/admin/dev (create/edit/upload),
// Admin = admin/developer (soft-delete), Viewer = any authenticated customer
// (draft detail read). Published docs are public.
const EDITOR_ROLES = ['admin', 'developer', 'maker', 'staff'];
const ADMIN_ROLES = ['admin', 'developer'];
const CATEGORIES = ['PAPER_FLOWER', 'ORIGAMI', 'MANUFACTURING_SPEC'];
const STATUSES = ['draft', 'published', 'archived'];
const DIFFICULTIES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolves the caller or null WITHOUT touching `res` — unlike authenticate(),
// which writes a 401 itself (fine as middleware, hangs when awaited inline).
async function optionalAuth(req) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    const payload = verifyToken(header.slice(7));
    const user = await prisma.user.findUnique({ where: { id: payload.id }, select: { id: true, email: true, role: true, name: true } });
    return user || null;
  } catch {
    return null;
  }
}

function bumpVersion(v) {
  const m = /^v(\d+)\.(\d+)$/.exec(String(v || ''));
  if (!m) return 'v1.1';
  return `v${Number(m[1])}.${Number(m[2]) + 1}`;
}

function mediaTypeFor(mime) {
  if (mime === 'image/svg+xml') return 'SVG_DIAGRAM';
  if (mime === 'application/pdf' || mime === 'application/zip' || mime === 'model/stl') return 'CAD_FILE';
  if (mime === 'video/mp4' || mime === 'video/quicktime') return 'VIDEO';
  return 'IMAGE';
}

function extFor(mime) {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'application/pdf': 'pdf', 'application/zip': 'zip', 'model/stl': 'stl', 'video/mp4': 'mp4', 'video/quicktime': 'mov' }[mime] || 'bin';
}

// Raster photos get the sharp pipeline (decode = the real content check);
// svg/gif/pdf/zip/stl/mp4 are stored raw after docMimeLooksReal().
async function processRaster(file) {
  try {
    const pipeline = sharp(file.buffer).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true });
    if (file.mimetype === 'image/png') return { buf: await pipeline.png({ compressionLevel: 9 }).toBuffer(), contentType: 'image/png', ext: 'png' };
    if (file.mimetype === 'image/webp') return { buf: await pipeline.webp({ quality: 85 }).toBuffer(), contentType: 'image/webp', ext: 'webp' };
    return { buf: await pipeline.jpeg({ quality: 85 }).toBuffer(), contentType: 'image/jpeg', ext: 'jpg' };
  } catch {
    throw Object.assign(new Error('Could not process image — is it a valid JPEG, PNG or WebP?'), { status: 415, code: 'unsupported_media_type' });
  }
}

// ── Schemas ──────────────────────────────────────────────────────────────────
const metadataSchema = z.object({
  difficulty: z.enum(DIFFICULTIES).optional(),
  estimatedTimeMinutes: z.number().int().min(1).max(100000).optional(),
  tools: z.array(z.string().min(1).max(120)).max(50).optional(),
  materialGsm: z.number().min(1).max(1000).optional(),
  foldingComplexity: z.enum(['simple', 'moderate', 'complex']).optional(),
  notes: z.string().max(2000).optional(),
}).passthrough(); // JSONB stays flexible beyond the typed core keys

const createSchema = z.object({
  title: z.string().min(3).max(200),
  category: z.enum(CATEGORIES),
  sku: z.string().min(2).max(64).regex(/^[A-Za-z0-9._-]+$/).optional(),
  contentMarkdown: z.string().min(1).max(500000),
  metadata: metadataSchema.optional(),
  status: z.enum(STATUSES).default('draft'),
}).strict();

const updateSchema = createSchema.partial().extend({
  revisionNote: z.string().max(500).optional(),
}).strict().refine((obj) => Object.keys(obj).some((k) => k !== 'revisionNote'), {
  message: 'At least one field is required',
});

const reorderSchema = z.object({ displayOrder: z.number().int().min(0).max(999) }).strict();

// ── List (public; drafts/archived/all are staff-gated) ───────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const status = String(req.query.status || 'published').slice(0, 10);
  const wantsNonPublic = status === 'all' || status === 'draft' || status === 'archived';
  if (wantsNonPublic) {
    const user = await optionalAuth(req);
    if (!user || !EDITOR_ROLES.includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden', code: 'forbidden' });
    }
  }
  if (status !== 'all' && !STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status', code: 'validation_failed' });
  }

  const where = { deletedAt: null };
  if (status !== 'all') where.status = status;

  const category = req.query.category ? String(req.query.category).slice(0, 30) : undefined;
  if (category) {
    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category', code: 'validation_failed' });
    where.category = category;
  }
  const sku = req.query.sku ? String(req.query.sku).slice(0, 64) : undefined;
  if (sku) where.sku = sku;
  const difficulty = req.query.difficulty ? String(req.query.difficulty).slice(0, 20) : undefined;
  if (difficulty) {
    if (!DIFFICULTIES.includes(difficulty)) return res.status(400).json({ error: 'Invalid difficulty', code: 'validation_failed' });
    where.metadata = { path: ['difficulty'], equals: difficulty }; // jsonb filter
  }
  const q = req.query.q ? String(req.query.q).slice(0, 200) : undefined;
  if (q) where.title = { contains: q, mode: 'insensitive' };

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const [total, procedures] = await prisma.$transaction([
    prisma.procedureDocument.count({ where }),
    prisma.procedureDocument.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        author: { select: { id: true, name: true } },
        media: { orderBy: { displayOrder: 'asc' }, take: 1, select: { id: true, url: true, mediaType: true } },
        _count: { select: { media: true } },
      },
    }),
  ]);
  res.json({ procedures, total, page, pages: Math.max(1, Math.ceil(total / limit)), limit });
}));

// ── Detail (published public; drafts/archived need any logged-in viewer) ─────
router.get('/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const doc = await prisma.procedureDocument.findFirst({
    where: { id, deletedAt: null },
    include: {
      author: { select: { id: true, name: true } },
      media: { orderBy: { displayOrder: 'asc' } },
      revisions: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, version: true, title: true, editorId: true, note: true, createdAt: true },
      },
    },
  });
  if (!doc) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  if (doc.status !== 'published') {
    const user = await optionalAuth(req);
    if (!user) return res.status(401).json({ error: 'Sign in to view this procedure', code: 'unauthorized' });
  }
  res.json(doc);
}));

// ── Full revision bodies (Editor+) ───────────────────────────────────────────
router.get('/:id/revisions', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const doc = await prisma.procedureDocument.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!doc) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const revisions = await prisma.procedureRevision.findMany({
    where: { documentId: id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(revisions);
}));

// ── Create (Editor+) ─────────────────────────────────────────────────────────
router.post('/', authenticate, requireRole(...EDITOR_ROLES), validate(createSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  const doc = await prisma.procedureDocument.create({
    data: {
      title: data.title,
      category: data.category,
      sku: data.sku || null,
      contentMarkdown: data.contentMarkdown,
      metadata: data.metadata ?? undefined,
      status: data.status,
      authorId: req.user.id,
    },
  });
  // Initial revision so history starts at v1.0 (PUT appends the rest).
  await prisma.procedureRevision.create({
    data: {
      documentId: doc.id, version: doc.version, title: doc.title,
      contentMarkdown: doc.contentMarkdown,
      metadata: doc.metadata ?? undefined,
      editorId: req.user.id, note: 'Initial version',
    },
  });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'procedure_create', entityType: 'procedure', entityId: doc.id, details: { title: doc.title, category: doc.category, sku: doc.sku } });
  res.status(201).json(doc);
}));

// ── Update (Editor+): auto minor version bump + revision snapshot ────────────
router.put('/:id', authenticate, requireRole(...EDITOR_ROLES), validate(updateSchema), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const current = await prisma.procedureDocument.findFirst({ where: { id, deletedAt: null } });
  if (!current) return res.status(404).json({ error: 'Not found', code: 'not_found' });

  const { revisionNote, ...fields } = req.validated;
  const nextVersion = bumpVersion(current.version);
  const doc = await prisma.procedureDocument.update({
    where: { id },
    data: { ...fields, metadata: fields.metadata ?? undefined, version: nextVersion },
  });
  await prisma.procedureRevision.create({
    data: {
      documentId: doc.id, version: nextVersion, title: doc.title,
      contentMarkdown: doc.contentMarkdown,
      metadata: doc.metadata ?? undefined,
      editorId: req.user.id, note: revisionNote ? revisionNote.slice(0, 500) : null,
    },
  });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'procedure_update', entityType: 'procedure', entityId: doc.id, details: { from: current.version, to: nextVersion } });
  res.json(doc);
}));

// ── Soft delete (Admin) ──────────────────────────────────────────────────────
router.delete('/:id', authenticate, requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const doc = await prisma.procedureDocument.findFirst({ where: { id, deletedAt: null } });
  if (!doc) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  await prisma.procedureDocument.update({ where: { id }, data: { deletedAt: new Date() } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'procedure_delete', entityType: 'procedure', entityId: doc.id, details: { title: doc.title, version: doc.version } });
  res.json({ id: doc.id, deleted: true });
}));

// ── Media upload (Editor+) ───────────────────────────────────────────────────
router.post('/:id/media', authenticate, requireRole(...EDITOR_ROLES), uploadDocs.array('files', 8), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const doc = await prisma.procedureDocument.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!doc) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No files', code: 'validation_failed' });

  // Validate the whole batch BEFORE storing anything (no partial uploads):
  // 1) magic-byte sniff, 2) sharp decode/resize (throws 415), 3) store.
  const prepared = [];
  for (const file of files) {
    if (!docMimeLooksReal(file.buffer, file.mimetype)) {
      return res.status(415).json({ error: `${file.originalname || 'file'} does not look like a valid ${file.mimetype}`, code: 'unsupported_media_type' });
    }
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      const processed = await processRaster(file); // throws 415 on decode failure
      prepared.push({ file, buf: processed.buf, contentType: processed.contentType, ext: processed.ext });
    } else {
      prepared.push({ file, buf: file.buffer, contentType: file.mimetype, ext: extFor(file.mimetype) });
    }
  }

  const agg = await prisma.documentMedia.aggregate({ where: { documentId: id }, _max: { displayOrder: true } });
  let order = agg._max.displayOrder ?? -1;
  const created = [];
  for (const p of prepared) {
    const key = `procedures/${doc.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${p.ext}`;
    const url = await putObject(key, p.buf, p.contentType, { bucket: 'procedure-media' });
    order += 1;
    created.push(await prisma.documentMedia.create({
      data: { documentId: doc.id, mediaType: mediaTypeFor(p.file.mimetype), url, displayOrder: order },
    }));
  }
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'procedure_media_upload', entityType: 'procedure', entityId: doc.id, details: { count: created.length } });
  res.status(201).json(created);
}));

// ── Reorder media (Editor+) ──────────────────────────────────────────────────
router.patch('/:id/media/:mediaId', authenticate, requireRole(...EDITOR_ROLES), validate(reorderSchema), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const mediaId = String(req.params.mediaId);
  if (!UUID_RE.test(id) || !UUID_RE.test(mediaId)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const doc = await prisma.procedureDocument.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!doc) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const media = await prisma.documentMedia.findFirst({ where: { id: mediaId, documentId: id } });
  if (!media) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const updated = await prisma.documentMedia.update({ where: { id: mediaId }, data: { displayOrder: req.validated.displayOrder } });
  res.json(updated);
}));

// ── Delete media (Editor+): storage object first, then the row ───────────────
router.delete('/:id/media/:mediaId', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const mediaId = String(req.params.mediaId);
  if (!UUID_RE.test(id) || !UUID_RE.test(mediaId)) return res.status(400).json({ error: 'Invalid id', code: 'validation_failed' });
  const doc = await prisma.procedureDocument.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!doc) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  const media = await prisma.documentMedia.findFirst({ where: { id: mediaId, documentId: id } });
  if (!media) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  await deleteObjectByUrl(media.url); // best-effort
  await prisma.documentMedia.delete({ where: { id: mediaId } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'procedure_media_delete', entityType: 'procedure', entityId: id, details: { mediaId, mediaType: media.mediaType } });
  res.json({ id: mediaId, deleted: true });
}));

export default router;
