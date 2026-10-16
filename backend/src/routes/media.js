// Media library & staff photo archive.
//
// LIBRARY assets live in the PUBLIC `media` bucket (publicUrl + responsive
// webp/avif variants, reusable on products/posts). STAFF assets live in the
// PRIVATE `staff-media` bucket (order/reference photos) and are only served
// through the authed GET /:id/file route. Folders organise both; rows are
// soft-deleted to a trash view and purged (bytes + row) by admin/developer.
// storageRef is always a "bucket/key" ref (storage.js delete/get contract);
// publicUrl carries the human-facing URL for LIBRARY assets.
import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import sharp from 'sharp';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { uploadMedia } from '../middleware/upload.js';
import { putObject, getObject, deleteObjectByUrl } from '../services/storage.js';
import { buildVariants } from '../services/imageVariants.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { audit } from '../lib/audit.js';
import { publicCache, noStore } from '../lib/http-cache.js';

const router = Router();
const EDITOR_ROLES = ['admin', 'developer', 'maker', 'staff'];
const ADMIN_ROLES = ['admin', 'developer'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uploadLimit = rateLimit('media_upload', 30, 5);
const readLimit = rateLimit('media_read', 120, 1);

const META_SELECT = {
  id: true, title: true, altText: true, caption: true, mime: true, sizeBytes: true,
  publicUrl: true, sha256: true, width: true, height: true, variants: true, thumbRef: true,
  visibility: true, source: true, folderId: true, tags: true, uploadedById: true,
  deletedAt: true, createdAt: true, updatedAt: true,
};

const bucketFor = (visibility) => (visibility === 'STAFF' ? 'staff-media' : 'media');
const keyPrefixFor = (visibility) => (visibility === 'STAFF' ? 'archive' : 'library');
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

async function makeThumb(buffer) {
  try {
    return await sharp(buffer).rotate().resize(160, 160, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
  } catch {
    return null;
  }
}

// Decode-validate + geometry. Masters are stored as the original bytes
// (preserves alpha/transparency and photo quality) — sharp is the content
// check. Oversized JPEGs are re-encoded to keep storage sane.
async function prepareMaster(mime, buffer) {
  try {
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) throw new Error('no geometry');
    let buf = buffer;
    if (mime === 'image/jpeg' && (meta.width > 2400 || meta.height > 2400)) {
      buf = await sharp(buffer).rotate().resize(2400, 2400, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    }
    return { buf, width: meta.width, height: meta.height };
  } catch {
    throw Object.assign(new Error('Image could not be decoded'), { status: 415, code: 'unsupported_media_type', expose: true });
  }
}

const EXT_FOR = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

// ── Folders (Editor+) ──────────────────────────────────────────────────────
const folderCreate = z.object({ name: z.string().trim().min(1).max(80), parentId: z.string().uuid().nullable().optional() });
const folderPatch = z.object({ name: z.string().trim().min(1).max(80).optional(), parentId: z.string().uuid().nullable().optional() });

router.get('/folders', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const folders = await prisma.mediaFolder.findMany({
    orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { assets: { where: { deletedAt: null } }, children: true } } },
  });
  res.json(folders);
}));

router.post('/folders', authenticate, requireRole(...EDITOR_ROLES), validate(folderCreate), asyncHandler(async (req, res) => {
  const { name, parentId } = req.validated;
  if (parentId && !(await prisma.mediaFolder.findUnique({ where: { id: parentId } }))) {
    return res.status(404).json({ error: 'Parent folder not found', code: 'not_found' });
  }
  const folder = await prisma.mediaFolder.create({ data: { name, parentId: parentId || null } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_folder_create', entityType: 'media_folder', entityId: folder.id, details: { name } });
  res.status(201).json(folder);
}));

router.patch('/folders/:id', authenticate, requireRole(...EDITOR_ROLES), validate(folderPatch), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const folder = await prisma.mediaFolder.findUnique({ where: { id } });
  if (!folder) return res.status(404).json({ error: 'Folder not found', code: 'not_found' });
  const { name, parentId } = req.validated;
  if (parentId) {
    if (parentId === id) return res.status(400).json({ error: 'Folder cannot be its own parent', code: 'validation_failed' });
    const parent = await prisma.mediaFolder.findUnique({ where: { id: parentId }, include: { children: true } });
    if (!parent) return res.status(404).json({ error: 'Parent folder not found', code: 'not_found' });
  }
  const updated = await prisma.mediaFolder.update({ where: { id }, data: { ...(name !== undefined ? { name } : {}), ...(parentId !== undefined ? { parentId: parentId || null } : {}) } });
  res.json(updated);
}));

router.delete('/folders/:id', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const folder = await prisma.mediaFolder.findUnique({ where: { id }, include: { children: true } });
  if (!folder) return res.status(404).json({ error: 'Folder not found', code: 'not_found' });
  // Reparent children up; assets land in Unfiled (folderId null).
  await prisma.$transaction([
    prisma.mediaFolder.updateMany({ where: { parentId: id }, data: { parentId: folder.parentId || null } }),
    prisma.mediaAsset.updateMany({ where: { folderId: id }, data: { folderId: null } }),
    prisma.mediaFolder.delete({ where: { id } }),
  ]);
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_folder_delete', entityType: 'media_folder', entityId: id, details: { name: folder.name } });
  res.json({ ok: true });
}));

// ── List (Editor+): q/folder/visibility/trash filters ───────────────────────
router.get('/', authenticate, requireRole(...EDITOR_ROLES), readLimit, asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const trashed = req.query.trashed === '1' || req.query.trashed === 'true';
  const visibility = req.query.visibility === 'STAFF' || req.query.visibility === 'LIBRARY' ? req.query.visibility : undefined;
  const folderId = isUuid(String(req.query.folderId || '')) ? String(req.query.folderId) : undefined;
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '24'), 10) || 24));

  const where = { deletedAt: trashed ? { not: null } : null };
  if (visibility) where.visibility = visibility;
  if (folderId) where.folderId = folderId;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { caption: { contains: q, mode: 'insensitive' } },
      { tags: { has: q } },
    ];
  }
  const [assets, total] = await Promise.all([
    prisma.mediaAsset.findMany({ where, select: META_SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.mediaAsset.count({ where }),
  ]);
  noStore(res); // staff-only data — never cacheable
  res.json({ assets, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}));

// ── Upload (Editor+) ───────────────────────────────────────────────────────
router.post('/', authenticate, requireRole(...EDITOR_ROLES), uploadLimit, uploadMedia.single('file'), asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file || !file.buffer?.length) return res.status(400).json({ error: 'No file — send the image as multipart field "file"', code: 'validation_failed' });
  const visibility = req.body?.visibility === 'STAFF' ? 'STAFF' : 'LIBRARY';
  const prepared = await prepareMaster(file.mimetype, file.buffer);
  const buf = prepared.buf;

  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const existing = await prisma.mediaAsset.findFirst({ where: { sha256, visibility, deletedAt: null } });
  if (existing) return res.status(200).json({ asset: existing, deduped: true });

  const folderId = isUuid(String(req.body?.folderId || '')) ? String(req.body.folderId) : null;
  if (folderId && !(await prisma.mediaFolder.findUnique({ where: { id: folderId } }))) {
    return res.status(404).json({ error: 'Folder not found', code: 'not_found' });
  }

  const assetId = crypto.randomUUID();
  const ext = EXT_FOR[file.mimetype] || 'bin';
  const base = `${keyPrefixFor(visibility)}/${assetId}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  const bucket = bucketFor(visibility);

  // LIBRARY: responsive variants like ProductImage (same map shape).
  let built = [];
  if (visibility === 'LIBRARY') {
    try { built = await buildVariants(buf); } catch (e) {
      console.warn(JSON.stringify({ level: 'warn', msg: 'media variant encode failed', err: e?.message }));
    }
  }
  const uploads = [
    { key: `${base}.${ext}`, buf, contentType: file.mimetype },
    ...built.map((v) => ({ key: `${base}-${v.width}.${v.ext}`, buf: v.buf, contentType: v.contentType })),
  ];
  const returned = [];
  try {
    for (const u of uploads) returned.push(await putObject(u.key, u.buf, u.contentType, { bucket }));
  } catch (e) {
    await Promise.all(returned.map((u) => deleteObjectByUrl(u).catch(() => {})));
    throw e;
  }
  const [masterReturned, ...variantReturned] = returned;
  const storageRef = `${bucket}/${base}.${ext}`;
  let variants = null;
  if (built.length) {
    variants = {};
    built.forEach((v, i) => { variants[v.ext] = { ...(variants[v.ext] || {}), [String(v.width)]: variantReturned[i] }; });
  }
  let thumbRef = null;
  if (visibility === 'STAFF') {
    const tbuf = await makeThumb(file.buffer);
    if (tbuf) {
      await putObject(`${base}-thumb.webp`, tbuf, 'image/webp', { bucket });
      thumbRef = `${bucket}/${base}-thumb.webp`;
    }
  }

  const title = String(req.body?.title || file.originalname || 'Untitled').replace(/\.[^.]+$/, '').slice(0, 200) || 'Untitled';
  const tags = String(req.body?.tags || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10);
  const row = await prisma.mediaAsset.create({
    data: {
      id: assetId, title,
      altText: req.body?.altText ? String(req.body.altText).slice(0, 255) : null,
      caption: req.body?.caption ? String(req.body.caption).slice(0, 500) : null,
      mime: file.mimetype, sizeBytes: buf.length, storageRef,
      publicUrl: visibility === 'LIBRARY' ? masterReturned : null,
      sha256, width: prepared.width, height: prepared.height, variants, thumbRef,
      visibility,
      source: req.body?.source === 'CAMERA' ? 'CAMERA' : req.body?.source === 'IMPORT' ? 'IMPORT' : 'UPLOAD',
      folderId, tags, uploadedById: req.user.id,
    },
    select: META_SELECT,
  });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_upload', entityType: 'media_asset', entityId: row.id, details: { title: row.title, visibility, sizeBytes: row.sizeBytes, source: row.source } });
  res.status(201).json({ asset: row, deduped: false });
}));

// ── Read one / bytes / thumb (Editor+) ─────────────────────────────────────
router.get('/:id', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const asset = await prisma.mediaAsset.findUnique({ where: { id }, select: { ...META_SELECT, attachments: { select: { id: true, attachableType: true, attachableId: true, role: true, sortOrder: true }, orderBy: { createdAt: 'asc' } } } });
  if (!asset) return res.status(404).json({ error: 'Media asset not found', code: 'not_found' });
  noStore(res);
  res.json(asset);
}));

router.get('/:id/file', authenticate, requireRole(...EDITOR_ROLES), readLimit, asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset || asset.deletedAt) return res.status(404).json({ error: 'Media asset not found', code: 'not_found' });
  if (asset.visibility === 'LIBRARY' && asset.publicUrl) {
    // Public bucket — redirect to the CDN URL (no bytes through the function).
    return res.redirect(asset.publicUrl);
  }
  let buffer;
  try { buffer = await getObject(asset.storageRef); } catch (e) {
    if (e?.status === 404) return res.status(404).json({ error: 'File not found', code: 'not_found' });
    throw e;
  }
  res.setHeader('Content-Type', asset.mime);
  res.setHeader('Content-Disposition', `inline; filename="${asset.title.replace(/[^\x20-\x7E]/g, '_')}.${(EXT_FOR[asset.mime] || 'bin')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(buffer);
}));

router.get('/:id/thumb', authenticate, requireRole(...EDITOR_ROLES), readLimit, asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset || asset.deletedAt) return res.status(404).json({ error: 'Media asset not found', code: 'not_found' });
  const ref = asset.thumbRef || (asset.visibility === 'LIBRARY' && asset.variants?.webp ? asset.variants.webp['400'] : null);
  if (asset.visibility === 'LIBRARY') {
    const url = typeof ref === 'string' && ref.startsWith('http') ? ref : asset.publicUrl;
    if (url) return res.redirect(url);
    return res.status(404).json({ error: 'No thumbnail', code: 'not_found' });
  }
  if (!ref) return res.status(404).json({ error: 'No thumbnail', code: 'not_found' });
  const buffer = await getObject(String(ref));
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(buffer);
}));

// ── Update metadata (Editor+); STAFF→LIBRARY promotion is admin-only ───────
const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  altText: z.string().trim().max(255).nullable().optional(),
  caption: z.string().trim().max(500).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
  folderId: z.string().uuid().nullable().optional(),
  visibility: z.enum(['LIBRARY', 'STAFF']).optional(),
});

router.patch('/:id', authenticate, requireRole(...EDITOR_ROLES), validate(patchSchema), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) return res.status(404).json({ error: 'Media asset not found', code: 'not_found' });
  const data = { ...req.validated };

  if (data.folderId) {
    if (!(await prisma.mediaFolder.findUnique({ where: { id: data.folderId } }))) {
      return res.status(404).json({ error: 'Folder not found', code: 'not_found' });
    }
  }

  // Visibility change moves bytes between buckets (library ⇄ staff archive).
  if (data.visibility && data.visibility !== asset.visibility) {
    if (data.visibility === 'LIBRARY' && !ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ error: 'Promoting an asset to the public library requires admin', code: 'forbidden' });
    }
    const bytes = await getObject(asset.storageRef);
    const bucket = bucketFor(data.visibility);
    const ext = EXT_FOR[asset.mime] || 'bin';
    const base = `${keyPrefixFor(data.visibility)}/${id}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
    const returned = await putObject(`${base}.${ext}`, bytes, asset.mime, { bucket });
    let variants = null;
    let thumbRef = null;
    if (data.visibility === 'LIBRARY') {
      try {
        const built = await buildVariants(bytes);
        const vals = [];
        for (const v of built) vals.push(await putObject(`${base}-${v.width}.${v.ext}`, v.buf, v.contentType, { bucket }));
        if (built.length) {
          variants = {};
          built.forEach((v, i) => { variants[v.ext] = { ...(variants[v.ext] || {}), [String(v.width)]: vals[i] }; });
        }
      } catch { /* variants best-effort */ }
    } else {
      const tbuf = await makeThumb(bytes);
      if (tbuf) {
        await putObject(`${base}-thumb.webp`, tbuf, 'image/webp', { bucket });
        thumbRef = `${bucket}/${base}-thumb.webp`;
      }
    }
    // Remove the old bytes (master + variants + thumb) after the copy landed.
    await deleteObjectByUrl(asset.storageRef).catch(() => {});
    if (asset.variants && typeof asset.variants === 'object') {
      const old = Object.values(asset.variants).flatMap((m) => (m && typeof m === 'object' ? Object.values(m) : [])).filter(Boolean);
      await Promise.all(old.map((u) => deleteObjectByUrl(String(u)).catch(() => {})));
    }
    if (asset.thumbRef) await deleteObjectByUrl(asset.thumbRef).catch(() => {});
    Object.assign(data, {
      storageRef: `${bucket}/${base}.${ext}`,
      publicUrl: data.visibility === 'LIBRARY' ? returned : null,
      variants, thumbRef,
    });
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_visibility_change', entityType: 'media_asset', entityId: id, details: { from: asset.visibility, to: data.visibility } });
  }

  const updated = await prisma.mediaAsset.update({ where: { id }, data, select: META_SELECT });
  res.json(updated);
}));

// ── Trash lifecycle: soft delete / restore / purge ─────────────────────────
router.delete('/:id', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset || asset.deletedAt) return res.status(404).json({ error: 'Media asset not found', code: 'not_found' });
  await prisma.mediaAsset.update({ where: { id }, data: { deletedAt: new Date() } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_soft_delete', entityType: 'media_asset', entityId: id, details: { title: asset.title } });
  res.json({ ok: true });
}));

router.post('/:id/restore', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) return res.status(404).json({ error: 'Media asset not found', code: 'not_found' });
  if (!asset.deletedAt) return res.status(400).json({ error: 'Asset is not in the trash', code: 'validation_failed' });
  const updated = await prisma.mediaAsset.update({ where: { id }, data: { deletedAt: null }, select: META_SELECT });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_restore', entityType: 'media_asset', entityId: id });
  res.json(updated);
}));

router.delete('/:id/purge', authenticate, requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const asset = await prisma.mediaAsset.findUnique({ where: { id }, include: { attachments: true } });
  if (!asset) return res.status(404).json({ error: 'Media asset not found', code: 'not_found' });
  if (asset.attachments.length) {
    return res.status(409).json({ error: 'Asset is still attached to content — detach it first', code: 'asset_in_use' });
  }
  await deleteObjectByUrl(asset.storageRef).catch(() => {});
  if (asset.variants && typeof asset.variants === 'object') {
    const urls = Object.values(asset.variants).flatMap((m) => (m && typeof m === 'object' ? Object.values(m) : [])).filter(Boolean);
    await Promise.all(urls.map((u) => deleteObjectByUrl(String(u)).catch(() => {})));
  }
  if (asset.thumbRef) await deleteObjectByUrl(asset.thumbRef).catch(() => {});
  await prisma.mediaAsset.delete({ where: { id } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_purge', entityType: 'media_asset', entityId: id, details: { title: asset.title } });
  res.json({ ok: true });
}));

export default router;
