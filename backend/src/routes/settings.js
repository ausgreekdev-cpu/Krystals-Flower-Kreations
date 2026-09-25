import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { audit } from '../lib/audit.js';
import { getSettings, validateSettingsBody, schemaMetadata } from '../lib/settingsSchema.js';

const router = Router();

// Public-safe subset of settings (no secrets) for the storefront.
// Filter + defaults derive from settingsSchema.js so it can never drift.
router.get('/', asyncHandler(async (req, res) => {
  res.json(await getSettings({ onlyPublic: true }));
}));

// Settings schema (sections/labels/types/defaults) for the admin form.
router.get('/schema', requireAuth, requireRole('admin','developer'), asyncHandler(async (req, res) => {
  res.json(schemaMetadata());
}));

// Admin: all settings (stored values merged over schema defaults)
router.get('/all', requireAuth, requireRole('admin','developer'), asyncHandler(async (req, res) => {
  res.json(await getSettings());
}));

// Upsert settings (auth-gated, schema-validated; unknown keys rejected)
router.put('/', requireAuth, requireRole('admin','developer'), asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Body must be an object of setting keys', code: 'validation_failed' });
  }
  if (!Object.keys(body).length) {
    return res.status(400).json({ error: 'No settings provided', code: 'validation_failed' });
  }
  const { ok, errors, values } = validateSettingsBody(body);
  if (!ok) {
    return res.status(400).json({ error: 'Invalid settings', code: 'invalid_settings', details: errors });
  }
  await prisma.$transaction(
    Object.entries(values).map(([key, value]) => prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    }))
  );
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'settings_update', entityType: 'setting', details: { keys: Object.keys(values) } });
  res.json({ ok: true, updated: Object.keys(values).length, values });
}));

export default router;
