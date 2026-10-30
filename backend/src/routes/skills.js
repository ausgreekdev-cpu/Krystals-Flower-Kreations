// In-app skills (reusable instruction sets).
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

const skillSchema = z.object({
  name: z.string().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  description: z.string().max(500).optional().nullable(),
  content: z.string().min(1).max(50000),
  triggers: z.array(z.string().min(1).max(60)).max(20).optional(),
  isActive: z.boolean().optional(),
}).strict();

router.get('/', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const skills = await prisma.skill.findMany({ orderBy: { name: 'asc' } });
  res.json(skills);
}));

router.get('/:id', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const skill = await prisma.skill.findUnique({ where: { id } });
  if (!skill) return res.status(404).json({ error: 'Skill not found', code: 'not_found' });
  res.json(skill);
}));

router.post('/', authenticate, requireRole(...ADMIN_ROLES), validate(skillSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  try {
    const skill = await prisma.skill.create({
      data: { name: data.name, description: data.description || null, content: data.content, triggers: data.triggers || [], isActive: data.isActive ?? true },
    });
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'skill_create', entityType: 'skill', entityId: skill.id, details: { name: skill.name } });
    res.status(201).json(skill);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Skill name already exists', code: 'conflict' });
    throw e;
  }
}));

router.patch('/:id', authenticate, requireRole(...ADMIN_ROLES), validate(skillSchema.partial().strict(), { partial: true }), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const existing = await prisma.skill.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Skill not found', code: 'not_found' });
  const data = req.validated;
  const skill = await prisma.skill.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.content !== undefined ? { content: data.content } : {}),
      ...(data.triggers !== undefined ? { triggers: data.triggers } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'skill_update', entityType: 'skill', entityId: id, details: { fields: Object.keys(data) } });
  res.json(skill);
}));

router.delete('/:id', authenticate, requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const skill = await prisma.skill.findUnique({ where: { id } });
  if (!skill) return res.status(404).json({ error: 'Skill not found', code: 'not_found' });
  await prisma.skill.delete({ where: { id } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'skill_delete', entityType: 'skill', entityId: id, details: { name: skill.name } });
  res.json({ ok: true });
}));

export default router;
