// In-app automations (scheduled/event-triggered actions).
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { audit } from '../lib/audit.js';

const router = Router();
const EDITOR_ROLES = ['admin', 'developer', 'maker', 'staff'];
const ADMIN_ROLES = ['admin', 'developer'];

const automationSchema = z.object({
  name: z.string().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  description: z.string().max(500).optional().nullable(),
  trigger: z.string().min(1).max(200),
  triggerType: z.enum(['cron', 'event', 'manual']),
  action: z.string().min(1).max(100),
  actionType: z.enum(['workflow', 'function']),
  params: z.record(z.any()).optional().nullable(),
  isActive: z.boolean().optional(),
}).strict();

router.get('/', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const automations = await prisma.automation.findMany({ orderBy: { name: 'asc' } });
  res.json(automations);
}));

router.get('/:id', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const automation = await prisma.automation.findUnique({ where: { id } });
  if (!automation) return res.status(404).json({ error: 'Automation not found', code: 'not_found' });
  res.json(automation);
}));

router.post('/', authenticate, requireRole(...ADMIN_ROLES), validate(automationSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  try {
    const automation = await prisma.automation.create({
      data: {
        name: data.name, description: data.description || null, trigger: data.trigger,
        triggerType: data.triggerType, action: data.action, actionType: data.actionType,
        params: data.params || null, isActive: data.isActive ?? true,
      },
    });
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'automation_create', entityType: 'automation', entityId: automation.id, details: { name: automation.name } });
    res.status(201).json(automation);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Automation name already exists', code: 'conflict' });
    throw e;
  }
}));

router.patch('/:id', authenticate, requireRole(...ADMIN_ROLES), validate(automationSchema.partial().strict(), { partial: true }), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const existing = await prisma.automation.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Automation not found', code: 'not_found' });
  const data = req.validated;
  const automation = await prisma.automation.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.trigger !== undefined ? { trigger: data.trigger } : {}),
      ...(data.triggerType !== undefined ? { triggerType: data.triggerType } : {}),
      ...(data.action !== undefined ? { action: data.action } : {}),
      ...(data.actionType !== undefined ? { actionType: data.actionType } : {}),
      ...(data.params !== undefined ? { params: data.params } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'automation_update', entityType: 'automation', entityId: id, details: { fields: Object.keys(data) } });
  res.json(automation);
}));

router.delete('/:id', authenticate, requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const automation = await prisma.automation.findUnique({ where: { id } });
  if (!automation) return res.status(404).json({ error: 'Automation not found', code: 'not_found' });
  await prisma.automation.delete({ where: { id } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'automation_delete', entityType: 'automation', entityId: id, details: { name: automation.name } });
  res.json({ ok: true });
}));

// Manual trigger
router.post('/:id/trigger', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const automation = await prisma.automation.findUnique({ where: { id } });
  if (!automation) return res.status(404).json({ error: 'Automation not found', code: 'not_found' });
  if (!automation.isActive) return res.status(409).json({ error: 'Automation is disabled', code: 'automation_disabled' });

  await prisma.automation.update({ where: { id }, data: { lastRunAt: new Date() } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'automation_trigger', entityType: 'automation', entityId: id, details: { name: automation.name } });
  res.json({ ok: true, triggered: automation.name, action: automation.action });
}));

export default router;
