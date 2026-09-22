import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();

const PUBLIC_KEYS = new Set(['notebooklm_url', 'abn', 'business_name', 'business_address', 'tax_gst_rate']);

// Public-safe subset of settings (no secrets) for the storefront.
router.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.setting.findMany();
  const out = {};
  for (const row of rows) {
    if (PUBLIC_KEYS.has(row.key)) out[row.key] = row.value;
  }
  res.json(out);
}));

// Admin can read any setting (non-secret value included; secrets live in env)
router.get('/all', requireAuth, requireRole('admin','developer'), asyncHandler(async (req, res) => {
  const rows = await prisma.setting.findMany();
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
}));

// Upsert one or more settings (auth-gated)
router.put('/', requireAuth, requireRole('admin','developer'), asyncHandler(async (req, res) => {
  const body = req.body || {};
  const keys = Object.keys(body).filter(k => typeof k === 'string' && k.length <= 100);
  if (!keys.length) return res.status(400).json({ error: 'No settings provided', code: 'validation_failed' });
  const tx = await prisma.$transaction(
    keys.map(k => prisma.setting.upsert({
      where: { key: k },
      create: { key: k, value: String(body[k]) },
      update: { value: String(body[k]) },
    }))
  );
  res.json({ ok: true, updated: keys.length });
}));

export default router;