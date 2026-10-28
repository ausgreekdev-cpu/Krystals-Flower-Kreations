// 3D model (GLB) upload for configurator templates.
//
// Each configurator template (wattle-sprig, paper-rose, banksia-petal, origami-lily)
// has an optional 3D model for the AR viewer. Admins upload a GLB here. In dev
// (local disk) it's written to backend/uploads/3d/<templateId>.glb and served
// statically at /3d/<templateId>.glb. In prod (Supabase) it's stored in the
// 3d-models bucket and served via GET /api/models-3d/:templateId/file.
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { uploadMedia } from '../middleware/upload.js';
import { putObject, getObject, deleteObjectByUrl, storageDriver } from '../services/storage.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { audit } from '../lib/audit.js';

const router = Router();
const ADMIN_ROLES = ['admin', 'developer'];

const TEMPLATES = ['wattle-sprig', 'paper-rose', 'banksia-petal', 'origami-lily'];

const uploadLimit = rateLimit('glb_upload', 10, 1);

// List all 3D models
router.get('/', authenticate, requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const models = await prisma.model3D.findMany({
    orderBy: { templateId: 'asc' },
    select: { id: true, templateId: true, title: true, mime: true, sizeBytes: true, storageRef: true, uploadedById: true, createdAt: true },
  });
  res.json(models);
}));

const uploadSchema = z.object({
  templateId: z.enum(TEMPLATES),
  title: z.string().max(200).optional(),
});

// Upload a GLB for a template
router.post('/', authenticate, requireRole(...ADMIN_ROLES), uploadLimit, uploadMedia.single('file'), validate(uploadSchema), asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file || !file.buffer?.length) return res.status(400).json({ error: 'No file — send the GLB as multipart field "file"', code: 'validation_failed' });

  // Validate it's a GLB
  const isGlb = file.mimetype === 'model/gltf-binary' || /\.glb$/i.test(file.originalname || '');
  if (!isGlb) return res.status(415).json({ error: 'Only GLB files are accepted', code: 'unsupported_media_type' });

  // Validate GLB magic header (first 4 bytes = "glTF")
  const magic = file.buffer.subarray(0, 4).toString('ascii');
  if (magic !== 'glTF') return res.status(415).json({ error: 'File does not appear to be a valid GLB (bad magic header)', code: 'unsupported_media_type' });

  const { templateId, title } = req.validated;
  const existing = await prisma.model3D.findUnique({ where: { templateId } });
  if (existing) {
    await deleteObjectByUrl(existing.storageRef).catch(() => {});
  }

  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const assetId = crypto.randomUUID();
  const fileName = `${templateId}.glb`;

  // In dev (local disk), write directly to backend/uploads/3d/ so /3d/<templateId>.glb serves
  let storageRef;
  if (storageDriver() === 'local') {
    const localDir = path.join(process.cwd(), 'uploads', '3d');
    await fs.promises.mkdir(localDir, { recursive: true });
    await fs.promises.writeFile(path.join(localDir, fileName), file.buffer);
    storageRef = `local:3d/${fileName}`;
  } else {
    // Prod (Supabase): store in 3d-models bucket
    storageRef = await putObject(`3d-models/${templateId}-${assetId}.glb`, file.buffer, 'model/gltf-binary', { bucket: '3d-models' });
  }

  if (existing) {
    await prisma.model3D.update({
      where: { templateId },
      data: { title: title || file.originalname || templateId, mime: 'model/gltf-binary', sizeBytes: file.buffer.length, storageRef, sha256, uploadedById: req.user.id },
    });
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'model3d_replace', entityType: 'model3d', entityId: existing.id, details: { templateId, sizeBytes: file.buffer.length } });
    const updated = await prisma.model3D.findUnique({ where: { templateId } });
    return res.status(200).json({ model: updated, replaced: true });
  }

  const model = await prisma.model3D.create({
    data: {
      id: assetId,
      templateId,
      title: title || file.originalname || templateId,
      mime: 'model/gltf-binary',
      sizeBytes: file.buffer.length,
      storageRef,
      sha256,
      uploadedById: req.user.id,
    },
  });

  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'model3d_upload', entityType: 'model3d', entityId: model.id, details: { templateId, sizeBytes: file.buffer.length } });
  res.status(201).json({ model });
}));

// Download/stream the GLB file (prod Supabase fallback — dev uses static /3d/)
router.get('/:templateId/file', asyncHandler(async (req, res) => {
  const templateId = String(req.params.templateId);
  if (!TEMPLATES.includes(templateId)) return res.status(404).json({ error: 'Unknown template', code: 'not_found' });

  const model = await prisma.model3D.findUnique({ where: { templateId } });
  if (!model) return res.status(404).json({ error: 'No 3D model for this template', code: 'not_found' });

  // Dev: redirect to static file
  if (model.storageRef.startsWith('local:')) {
    return res.redirect(`/3d/${templateId}.glb`);
  }

  const buffer = await getObject(model.storageRef);
  res.setHeader('Content-Type', 'model/gltf-binary');
  res.setHeader('Content-Disposition', `inline; filename="${templateId}.glb"`);
  res.setHeader('Cache-Control', 'public, max-age=259200'); // 30 days
  res.send(buffer);
}));

// Delete a model
router.delete('/:id', authenticate, requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const model = await prisma.model3D.findUnique({ where: { id } });
  if (!model) return res.status(404).json({ error: 'Model not found', code: 'not_found' });

  await deleteObjectByUrl(model.storageRef).catch(() => {});
  // Also clean up local dev file
  if (model.storageRef.startsWith('local:')) {
    const localPath = path.join(process.cwd(), 'uploads', '3d', `${model.templateId}.glb`);
    await fs.promises.unlink(localPath).catch(() => {});
  }
  await prisma.model3D.delete({ where: { id } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'model3d_delete', entityType: 'model3d', entityId: id, details: { templateId: model.templateId } });
  res.json({ ok: true });
}));

export default router;
