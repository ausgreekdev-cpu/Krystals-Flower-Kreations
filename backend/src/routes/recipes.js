import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
const EDITOR = ['admin', 'developer', 'maker', 'staff'];
const ADMIN = ['admin', 'developer'];

const convertSchema = z.object({
  title: z.string().min(1).max(200),
  objective: z.string().min(1).max(2000),
  sourceType: z.enum(['transcript', 'sop', 'notes', 'recording']),
  sourceContent: z.string().min(1).max(50000),
}).strict();

router.get('/', authenticate, requireRole(...EDITOR), asyncHandler(async (req, res) => {
  const drafts = await prisma.recipeDraft.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  res.json(drafts);
}));

router.get('/:id', authenticate, requireRole(...EDITOR), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const d = await prisma.recipeDraft.findUnique({ where: { id } });
  if (!d) return res.status(404).json({ error: 'Recipe draft not found', code: 'not_found' });
  res.json(d);
}));

// Convert an unstructured procedure into a Draft Recipe (LLM-assisted stub)
router.post('/convert', authenticate, requireRole(...EDITOR), validate(convertSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  const recipeJson = {
    metadata: { title: data.title, objective: data.objective, trigger: 'manual', estimatedDuration: null, requiredTools: [] },
    inputs: [],
    outputs: [],
    steps: [{ id: 'step_1', type: 'HUMAN_DECISION', description: 'Review and refine the generated recipe.' }],
  };
  const recipeMarkdown = `# ${data.title}\n\n**Objective:** ${data.objective}\n\n## Steps\n\n1. Review source content and refine.\n`;
  const draft = await prisma.recipeDraft.create({
    data: { title: data.title, objective: data.objective, sourceType: data.sourceType, sourceContent: data.sourceContent, recipeJson, recipeMarkdown, status: 'draft', createdBy: req.user.id },
  });
  res.status(201).json(draft);
}));

router.patch('/:id', authenticate, requireRole(...ADMIN), validate(z.object({ status: z.enum(['draft', 'reviewed', 'approved', 'rejected']).optional(), recipeJson: z.any().optional(), recipeMarkdown: z.string().optional() }).strict(), { partial: true }), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const data = req.validated;
  const updated = await prisma.recipeDraft.update({ where: { id }, data });
  res.json(updated);
}));

export default router;
