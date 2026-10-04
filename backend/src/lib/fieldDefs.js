import { z } from 'zod';
import prisma from './prisma.js';
import { authenticate, requireRole } from './auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { audit } from './audit.js';

// Admin-defined custom field definitions, entity-scoped (ProductField.entityType).
// Shared by products (public list for the storefront) and raw materials (staff).

export const fieldDefSchema = z.object({
  label: z.string().trim().min(2).max(60),
  key: z.string().trim().regex(/^[a-z][a-z0-9_-]{1,40}$/).optional(),
  type: z.enum(['text', 'number', 'boolean']).default('text'),
  position: z.number().int().min(0).max(999).optional(),
}).strict();

export const fieldPatchSchema = z.object({
  label: z.string().trim().min(2).max(60).optional(),
  position: z.number().int().min(0).max(999).optional(),
}).strict();

export const customFieldsSchema = z.record(z.union([z.string().max(500), z.number().finite(), z.boolean()])).optional();

export function fieldKeyFromLabel(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

// Values must match an active definition's type for this entity. Unknown keys → 400.
export async function validateCustomFields(input, entityType) {
  if (input === undefined) return undefined;
  const defs = await prisma.productField.findMany({ where: { deletedAt: null, entityType } });
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    const def = byKey.get(key);
    if (!def) throw Object.assign(new Error(`Unknown custom field "${key}"`), { status: 400, code: 'validation_failed' });
    const actual = typeof value;
    const ok = (def.type === 'text' && actual === 'string')
      || (def.type === 'number' && actual === 'number')
      || (def.type === 'boolean' && actual === 'boolean');
    if (!ok) throw Object.assign(new Error(`Field "${def.label}" expects ${def.type}`), { status: 400, code: 'validation_failed' });
    out[key] = value;
  }
  return out;
}

// Mounts GET/POST/PATCH/DELETE /fields on the parent router.
// publicList: products need an unauthenticated list (storefront renders values);
// material fields are staff-only.
export function registerFieldRoutes(router, { entityType, roles, publicList = false }) {
  const listAuth = publicList ? (req, res, next) => next() : authenticate;

  router.get('/fields', listAuth, asyncHandler(async (req, res) => {
    const fields = await prisma.productField.findMany({
      where: { entityType, deletedAt: null },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(fields);
  }));

  router.post('/fields', authenticate, requireRole(...roles), validate(fieldDefSchema), asyncHandler(async (req, res) => {
    const { label, type, position } = req.validated;
    const key = req.validated.key || fieldKeyFromLabel(label);
    if (!/^[a-z][a-z0-9_-]{1,40}$/.test(key)) return res.status(400).json({ error: 'Field key must start with a letter and use only a-z, 0-9, _ or -', code: 'validation_failed' });
    const existing = await prisma.productField.findUnique({ where: { key } });
    if (existing) return res.status(409).json({ error: 'Field key already exists', code: 'conflict' });
    try {
      const field = await prisma.productField.create({ data: { key, label, type, position: position ?? 0, entityType } });
      audit({ actorId: req.user.id, actorEmail: req.user.email, action: `${entityType}_field_create`, entityType: 'product_field', entityId: field.id, details: { key, type, entityType } });
      res.status(201).json(field);
    } catch (e) {
      if (e.code === 'P2002') return res.status(409).json({ error: 'Field key already exists', code: 'conflict' });
      throw e;
    }
  }));

  router.patch('/fields/:id', authenticate, requireRole(...roles), validate(fieldPatchSchema), asyncHandler(async (req, res) => {
    const data = req.validated;
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No fields to update', code: 'validation_failed' });
    const existing = await prisma.productField.findUnique({ where: { id: String(req.params.id).slice(0, 100) } });
    if (!existing || existing.deletedAt || existing.entityType !== entityType) return res.status(404).json({ error: 'Not found', code: 'not_found' });
    const field = await prisma.productField.update({ where: { id: existing.id }, data });
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: `${entityType}_field_update`, entityType: 'product_field', entityId: field.id, details: { fields: Object.keys(data) } });
    res.json(field);
  }));

  // Soft delete — stored values stay on the record but stop rendering
  router.delete('/fields/:id', authenticate, requireRole(...roles), asyncHandler(async (req, res) => {
    const existing = await prisma.productField.findUnique({ where: { id: String(req.params.id).slice(0, 100) } });
    if (!existing || existing.deletedAt || existing.entityType !== entityType) return res.status(404).json({ error: 'Not found', code: 'not_found' });
    await prisma.productField.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: `${entityType}_field_delete`, entityType: 'product_field', entityId: existing.id, details: { key: existing.key } });
    res.json({ ok: true });
  }));
}
