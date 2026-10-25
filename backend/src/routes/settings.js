import { Router } from 'express';
import { publicCache } from '../lib/http-cache.js';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { audit } from '../lib/audit.js';
import { getSettings, clearSettingsCache, validateSettingsBody, schemaMetadata, SETTINGS_BY_KEY } from '../lib/settingsSchema.js';
import { sendEmail, emailProviderStatus } from '../services/email.js';

const router = Router();

// Public-safe subset of settings (no secrets) for the storefront.
// Filter + defaults derive from settingsSchema.js so it can never drift.
router.get('/', asyncHandler(async (req, res) => {
  publicCache(res);
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
  clearSettingsCache();
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'settings_update', entityType: 'setting', details: { keys: Object.keys(values) } });
  res.json({ ok: true, updated: Object.keys(values).length, values });
}));

// Reset stored values back to schema defaults (POST — a destructive GET would
// be a bad idea and DELETE /:key can't express bulk resets cleanly).
router.post('/reset', requireAuth, requireRole('admin','developer'), asyncHandler(async (req, res) => {
  const keys = Array.isArray(req.body?.keys) ? req.body.keys.filter(k => typeof k === 'string') : null;
  if (!keys || !keys.length) return res.status(400).json({ error: 'Provide a non-empty "keys" array', code: 'validation_failed' });
  const unknown = keys.filter(k => !SETTINGS_BY_KEY[k]);
  if (unknown.length) return res.status(400).json({ error: 'Unknown settings', code: 'invalid_settings', details: Object.fromEntries(unknown.map(k => [k, 'unknown setting'])) });
  const { count } = await prisma.setting.deleteMany({ where: { key: { in: keys } } });
  clearSettingsCache();
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'settings_reset', entityType: 'setting', details: { keys, removed: count } });
  res.json({ ok: true, reset: keys, removed: count, values: await getSettings() });
}));

// Send a one-off test email so admins can verify outbound mail without placing
// an order. Reports which provider is configured so a silent queue is obvious.
router.post('/test-email', requireAuth, requireRole('admin','developer'), asyncHandler(async (req, res) => {
  const to = String(req.body?.to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'Provide a valid recipient email', code: 'validation_failed' });
  }
  const s = await getSettings();
  const status = emailProviderStatus();
  const result = await sendEmail({
    to,
    subject: `Test email — ${s.business_name || "Krystals Flower Creations"}`,
    text: `This is a test email from your KFK admin settings.\n\nFrom: ${s.email_from_name || ''}\nReply-To: ${s.email_reply_to || '(unset)'}\n${s.email_signature ? `\n${s.email_signature}\n` : ''}\nSent through: ${status.provider || 'not configured'}\nIf you received this, outbound email is working.`,
  });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'settings_test_email', entityType: 'setting', details: { to, provider: status.provider, smtpConfigured: status.configured, ok: Boolean(result.ok || result.skipped) } });
  res.json({
    ok: Boolean(result.ok),
    skipped: Boolean(result.skipped),
    provider: status.provider,
    from: status.from,
    // Kept for the existing admin panel, which reads smtpConfigured.
    smtpConfigured: status.configured,
    message: result.skipped
      ? 'No email provider configured — set RESEND_API_KEY (or POSTMARK_SERVER_TOKEN / SENDGRID_API_KEY) on the site, or SMTP_HOST/SMTP_USER/SMTP_PASS for an SMTP relay.'
      : result.ok ? `Test email sent to ${to} via ${status.provider}` : `Send failed: ${result.error}`,
  });
}));

export default router;
