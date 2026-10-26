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
import { noStore } from '../lib/http-cache.js';

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

// Move an asset's bytes between buckets (library ⇄ staff archive) and rebuild
// variants/thumb for the destination. Used by the single PATCH and bulk ops.
async function moveAssetVisibility(asset, visibility) {
  const bytes = await getObject(asset.storageRef);
  const bucket = bucketFor(visibility);
  const ext = EXT_FOR[asset.mime] || 'bin';
  const base = `${keyPrefixFor(visibility)}/${asset.id}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  const returned = await putObject(`${base}.${ext}`, bytes, asset.mime, { bucket });
  let variants = null;
  let thumbRef = null;
  if (visibility === 'LIBRARY') {
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
  await deleteObjectByUrl(asset.storageRef).catch(() => {});
  if (asset.variants && typeof asset.variants === 'object') {
    const old = Object.values(asset.variants).flatMap((m) => (m && typeof m === 'object' ? Object.values(m) : [])).filter(Boolean);
    await Promise.all(old.map((u) => deleteObjectByUrl(String(u)).catch(() => {})));
  }
  if (asset.thumbRef) await deleteObjectByUrl(asset.thumbRef).catch(() => {});
  return prisma.mediaAsset.update({
    where: { id: asset.id },
    data: { visibility, storageRef: `${bucket}/${base}.${ext}`, publicUrl: visibility === 'LIBRARY' ? returned : null, variants, thumbRef },
    select: META_SELECT,
  });
}

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

  // Exact-duplicate handling (sha256 per visibility) — see documents.js for
  // the same contract: reuse (default) | ask (409 + both sides) | replace
  // (existing row adopts incoming metadata) | keep_new (old row + bytes purged,
  // fresh row stored — refused while attached) | skip (discard the upload).
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const existing = await prisma.mediaAsset.findFirst({ where: { sha256, visibility, deletedAt: null } });
  const onDuplicate = String(req.body?.on_duplicate || 'reuse');
  if (!['reuse', 'ask', 'replace', 'keep_new', 'skip'].includes(onDuplicate)) {
    return res.status(400).json({ error: 'on_duplicate must be reuse|ask|replace|keep_new|skip', code: 'validation_failed' });
  }
  if (existing && onDuplicate === 'ask') {
    const att = await prisma.mediaAttachment.count({ where: { assetId: existing.id } });
    return res.status(409).json({
      error: `"${file.originalname}" is an exact duplicate of an existing media asset`,
      code: 'duplicate',
      existing: { ...existing, attachments: att },
      incoming: {
        title: String(req.body?.title || file.originalname || '').replace(/\.[^.]+$/, '').slice(0, 200),
        sizeBytes: buf.length, sha256, mime: file.mimetype, visibility,
      },
    });
  }
  if (existing && onDuplicate === 'skip') {
    return res.status(200).json({ asset: existing, deduped: true, skipped: true });
  }
  if (existing && onDuplicate === 'keep_new') {
    const att = await prisma.mediaAttachment.count({ where: { assetId: existing.id } });
    if (att) return res.status(409).json({ error: 'Existing asset is still attached to content — detach it first or use replace', code: 'asset_in_use', attachments: att });
    await deleteObjectByUrl(existing.storageRef).catch(() => {});
    if (existing.variants && typeof existing.variants === 'object') {
      const urls = Object.values(existing.variants).flatMap((m) => (m && typeof m === 'object' ? Object.values(m) : [])).filter(Boolean);
      await Promise.all(urls.map((u) => deleteObjectByUrl(String(u)).catch(() => {})));
    }
    if (existing.thumbRef) await deleteObjectByUrl(existing.thumbRef).catch(() => {});
    await prisma.mediaAsset.delete({ where: { id: existing.id } });
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_duplicate_replace', entityType: 'media_asset', entityId: existing.id, details: { title: existing.title, decision: 'keep_new' } });
  } else if (existing && onDuplicate === 'replace') {
    // One record survives: incoming metadata wins for identity fields; user
    // edits (visibility) are kept — dedupe is already scoped per visibility.
    const patch = {
      title: String(req.body?.title || file.originalname || '').replace(/\.[^.]+$/, '').slice(0, 200) || existing.title,
    };
    if (req.body?.tags !== undefined) patch.tags = String(req.body.tags).split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10);
    if (isUuid(String(req.body?.folderId || ''))) patch.folderId = String(req.body.folderId);
    else if (req.body?.folderId === '' || req.body?.folderId === '__root') patch.folderId = null;
    if (req.body?.caption !== undefined) patch.caption = req.body.caption ? String(req.body.caption).slice(0, 500) : null;
    if (req.body?.altText !== undefined) patch.altText = req.body.altText ? String(req.body.altText).slice(0, 255) : null;
    const updated = await prisma.mediaAsset.update({ where: { id: existing.id }, data: patch, select: META_SELECT });
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_duplicate_replace', entityType: 'media_asset', entityId: existing.id, details: { title: existing.title, decision: 'replace' } });
    return res.status(200).json({ asset: updated, deduped: true, replaced: true });
  } else if (existing) {
    return res.status(200).json({ asset: existing, deduped: true });
  }

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

// ── Attachments: "upload once, attach anywhere" ────────────────────────────
// Attaching snapshots the asset onto the target (ProductImage row for
// products, coverImageUrl for posts) and records a MediaAttachment for
// provenance/detach. Public surfaces only accept LIBRARY assets; ORDER
// reference photos may point at STAFF assets.
const attachSchema = z.object({
  assetId: z.string().uuid(),
  attachableType: z.enum(['PRODUCT', 'POST', 'ORDER', 'PAGE']),
  attachableId: z.string().min(8).max(100),
  role: z.enum(['cover', 'gallery', 'reference']).default('gallery'),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

// NOTE: registered before GET /:id — "/attachments" must not be read as an id.
router.get('/attachments', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const type = ['PRODUCT', 'POST', 'ORDER', 'PAGE'].includes(req.query.attachableType) ? req.query.attachableType : null;
  const targetId = String(req.query.attachableId || '').slice(0, 100);
  if (!type || !targetId) return res.status(400).json({ error: 'attachableType and attachableId are required', code: 'validation_failed' });
  const rows = await prisma.mediaAttachment.findMany({
    where: { attachableType: type, attachableId: targetId },
    include: { asset: { select: META_SELECT } },
    orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }],
  });
  noStore(res);
  res.json(rows);
}));

router.post('/attach', authenticate, requireRole(...EDITOR_ROLES), validate(attachSchema), asyncHandler(async (req, res) => {
  const { assetId, attachableType, attachableId, role, sortOrder } = req.validated;
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.deletedAt) return res.status(404).json({ error: 'Media asset not found', code: 'not_found' });
  if (attachableType !== 'ORDER' && (asset.visibility !== 'LIBRARY' || !asset.publicUrl)) {
    return res.status(409).json({ error: 'Only Library assets can be attached to public content — promote the asset first', code: 'asset_not_public' });
  }
  const existing = await prisma.mediaAttachment.findUnique({
    where: { assetId_attachableType_attachableId_role: { assetId, attachableType, attachableId, role } },
  });
  if (existing) return res.status(200).json({ attachment: existing, deduped: true });

  if (attachableType === 'PRODUCT') {
    const product = await prisma.product.findUnique({ where: { id: attachableId } });
    if (!product) return res.status(404).json({ error: 'Product not found', code: 'not_found' });
    const agg = await prisma.productImage.aggregate({ where: { productId: attachableId }, _max: { sortOrder: true } });
    const seq = sortOrder ?? ((agg._max.sortOrder ?? -1) + 1);
    const productImage = await prisma.productImage.create({
      data: {
        productId: attachableId, url: asset.publicUrl,
        alt: asset.altText || asset.title, sortOrder: seq,
        width: asset.width, height: asset.height,
        variants: asset.variants ?? undefined, mediaAssetId: asset.id,
      },
    });
    const attachment = await prisma.mediaAttachment.create({ data: { assetId, attachableType, attachableId, role, sortOrder: seq } });
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_attach', entityType: 'media_asset', entityId: assetId, details: { attachableType, attachableId, role } });
    return res.status(201).json({ attachment, productImage });
  }

  if (attachableType === 'POST') {
    const post = await prisma.post.findUnique({ where: { id: attachableId } });
    if (!post) return res.status(404).json({ error: 'Post not found', code: 'not_found' });
    if (role === 'cover') {
      await prisma.post.update({ where: { id: attachableId }, data: { coverImageUrl: asset.publicUrl } });
      await prisma.mediaAttachment.deleteMany({ where: { attachableType: 'POST', attachableId, role: 'cover' } });
    }
    const attachment = await prisma.mediaAttachment.create({ data: { assetId, attachableType, attachableId, role, sortOrder: sortOrder ?? 0 } });
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_attach', entityType: 'media_asset', entityId: assetId, details: { attachableType, attachableId, role } });
    return res.status(201).json({ attachment });
  }

  // ORDER / PAGE: provenance row only (reference photos etc.)
  const attachment = await prisma.mediaAttachment.create({ data: { assetId, attachableType, attachableId, role, sortOrder: sortOrder ?? 0 } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_attach', entityType: 'media_asset', entityId: assetId, details: { attachableType, attachableId, role } });
  res.status(201).json({ attachment });
}));

router.delete('/attachments/:id', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const att = await prisma.mediaAttachment.findUnique({ where: { id }, include: { asset: true } });
  if (!att) return res.status(404).json({ error: 'Attachment not found', code: 'not_found' });
  if (att.attachableType === 'PRODUCT') {
    // Remove the snapshot image created at attach time.
    await prisma.productImage.deleteMany({ where: { productId: att.attachableId, mediaAssetId: att.assetId } });
  } else if (att.attachableType === 'POST' && att.role === 'cover') {
    const post = await prisma.post.findUnique({ where: { id: att.attachableId } });
    if (post && att.asset?.publicUrl && post.coverImageUrl === att.asset.publicUrl) {
      await prisma.post.update({ where: { id: att.attachableId }, data: { coverImageUrl: null } });
    }
  }
  await prisma.mediaAttachment.delete({ where: { id } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_detach', entityType: 'media_asset', entityId: att.assetId, details: { attachableType: att.attachableType, attachableId: att.attachableId } });
  res.json({ ok: true });
}));

// ── Bulk operations (Editor+): tag/move/visibility/trash/restore/purge ─────
const bulkIds = z.array(z.string().uuid()).min(1).max(100);
const bulkUpdate = z.object({
  ids: bulkIds,
  patch: z.object({
    tagsAdd: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
    tagsRemove: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
    folderId: z.string().uuid().nullable().optional(),
    visibility: z.enum(['LIBRARY', 'STAFF']).optional(),
  }),
});

router.post('/bulk/update', authenticate, requireRole(...EDITOR_ROLES), validate(bulkUpdate), asyncHandler(async (req, res) => {
  const { ids, patch } = req.validated;
  const rows = await prisma.mediaAsset.findMany({ where: { id: { in: ids } }, select: { id: true, visibility: true, tags: true } });
  const found = new Set(rows.map((r) => r.id));
  const missing = ids.filter((i) => !found.has(i));

  if (patch.folderId) {
    const folder = await prisma.mediaFolder.findUnique({ where: { id: patch.folderId } });
    if (!folder) return res.status(404).json({ error: 'Folder not found', code: 'not_found' });
  }
  // Promotion to the public library is admin-only — fail loud rather than
  // silently promoting some of the selection.
  if (patch.visibility === 'LIBRARY' && rows.some((r) => r.visibility === 'STAFF') && !ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Promoting staff assets to the public library requires admin', code: 'forbidden' });
  }

  // Visibility changes move bytes per asset — reuse the shared helper
  // (bulk selections are ≤100, sequential keeps bucket traffic predictable).
  if (patch.visibility) {
    for (const row of rows) {
      if (row.visibility === patch.visibility) continue;
      const asset = await prisma.mediaAsset.findUnique({ where: { id: row.id } });
      await moveAssetVisibility(asset, patch.visibility);
    }
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_bulk_visibility', entityType: 'media_asset', entityId: 'bulk', details: { ids, to: patch.visibility } });
  }

  for (const row of rows) {
    const data = {};
    if (patch.folderId !== undefined) data.folderId = patch.folderId;
    if (patch.tagsAdd?.length || patch.tagsRemove?.length) {
      const next = new Set(row.tags || []);
      for (const t of patch.tagsAdd || []) next.add(t);
      for (const t of patch.tagsRemove || []) next.delete(t);
      data.tags = [...next].slice(0, 10);
    }
    if (Object.keys(data).length) await prisma.mediaAsset.update({ where: { id: row.id }, data });
  }
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_bulk_update', entityType: 'media_asset', entityId: 'bulk', details: { ids, patch: { ...patch, visibility: undefined } } });
  res.json({ updated: rows.length, missing });
}));

router.post('/bulk/delete', authenticate, requireRole(...EDITOR_ROLES), validate(z.object({ ids: bulkIds })), asyncHandler(async (req, res) => {
  const { ids } = req.validated;
  const { count } = await prisma.mediaAsset.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: new Date() } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_bulk_soft_delete', entityType: 'media_asset', entityId: 'bulk', details: { ids } });
  res.json({ trashed: count });
}));

router.post('/bulk/restore', authenticate, requireRole(...EDITOR_ROLES), validate(z.object({ ids: bulkIds })), asyncHandler(async (req, res) => {
  const { ids } = req.validated;
  const { count } = await prisma.mediaAsset.updateMany({ where: { id: { in: ids }, deletedAt: { not: null } }, data: { deletedAt: null } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_bulk_restore', entityType: 'media_asset', entityId: 'bulk', details: { ids } });
  res.json({ restored: count });
}));

router.post('/bulk/purge', authenticate, requireRole(...ADMIN_ROLES), validate(z.object({ ids: bulkIds })), asyncHandler(async (req, res) => {
  const { ids } = req.validated;
  const rows = await prisma.mediaAsset.findMany({ where: { id: { in: ids } }, include: { attachments: true } });
  const purged = [];
  const skipped = [];
  for (const asset of rows) {
    if (asset.attachments.length) { skipped.push({ id: asset.id, reason: 'attached' }); continue; }
    await deleteObjectByUrl(asset.storageRef).catch(() => {});
    if (asset.variants && typeof asset.variants === 'object') {
      const urls = Object.values(asset.variants).flatMap((m) => (m && typeof m === 'object' ? Object.values(m) : [])).filter(Boolean);
      await Promise.all(urls.map((u) => deleteObjectByUrl(String(u)).catch(() => {})));
    }
    if (asset.thumbRef) await deleteObjectByUrl(asset.thumbRef).catch(() => {});
    await prisma.mediaAsset.delete({ where: { id: asset.id } });
    purged.push(asset.id);
  }
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_bulk_purge', entityType: 'media_asset', entityId: 'bulk', details: { purged: purged.length, skipped: skipped.length } });
  res.json({ purged, skipped });
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
  const safeTitle = String(asset.title || 'file').replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const ext = EXT_FOR[asset.mime] || 'bin';
  // filename* (RFC 5987) carries the original title; clients that support it
  // prefer it over the legacy quoted filename= — the double-quote is therefore
  // neutralised in both slots.
  res.setHeader('Content-Disposition', `inline; filename="${safeTitle}.${ext}"; filename*=UTF-8''${encodeURIComponent(String(asset.title || 'file'))}`);
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
  res.setHeader('X-Content-Type-Options', 'nosniff');
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
    const moved = await moveAssetVisibility(asset, data.visibility);
    delete data.visibility; // applied inside moveAssetVisibility
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'media_visibility_change', entityType: 'media_asset', entityId: id, details: { from: asset.visibility, to: moved.visibility } });
    if (Object.keys(data).length === 0) return res.json(moved);
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
