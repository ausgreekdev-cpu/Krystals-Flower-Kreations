// In-app workflows (multi-step automations).
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { audit } from '../lib/audit.js';
import { compile } from '../agents/core/dag-compiler.js';
import { runDag } from '../agents/core/dag-runner.js';

const router = Router();
const EDITOR_ROLES = ['admin', 'developer', 'maker', 'staff'];
const ADMIN_ROLES = ['admin', 'developer'];

const stepSchema = z.object({
  action: z.string().min(1).max(100),
  params: z.record(z.any()).optional(),
  condition: z.string().max(200).optional().nullable(),
  label: z.string().max(100).optional(),
}).strict();

const workflowSchema = z.object({
  name: z.string().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  description: z.string().max(500).optional().nullable(),
  steps: z.array(stepSchema).min(1).max(50),
  isActive: z.boolean().optional(),
}).strict();

router.get('/', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const workflows = await prisma.workflow.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { runs: true } } },
  });
  res.json(workflows);
}));

router.get('/:id', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const workflow = await prisma.workflow.findUnique({
    where: { id },
    include: { runs: { orderBy: { createdAt: 'desc' }, take: 10 } },
  });
  if (!workflow) return res.status(404).json({ error: 'Workflow not found', code: 'not_found' });
  res.json(workflow);
}));

router.post('/', authenticate, requireRole(...ADMIN_ROLES), validate(workflowSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  try {
    const workflow = await prisma.workflow.create({
      data: { name: data.name, description: data.description || null, steps: data.steps, isActive: data.isActive ?? true },
    });
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'workflow_create', entityType: 'workflow', entityId: workflow.id, details: { name: workflow.name, steps: workflow.steps.length } });
    res.status(201).json(workflow);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Workflow name already exists', code: 'conflict' });
    throw e;
  }
}));

router.patch('/:id', authenticate, requireRole(...ADMIN_ROLES), validate(workflowSchema.partial().strict(), { partial: true }), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const existing = await prisma.workflow.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Workflow not found', code: 'not_found' });
  const data = req.validated;
  const workflow = await prisma.workflow.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.steps !== undefined ? { steps: data.steps } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'workflow_update', entityType: 'workflow', entityId: id, details: { fields: Object.keys(data) } });
  res.json(workflow);
}));

router.delete('/:id', authenticate, requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const workflow = await prisma.workflow.findUnique({ where: { id } });
  if (!workflow) return res.status(404).json({ error: 'Workflow not found', code: 'not_found' });
  await prisma.workflow.delete({ where: { id } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'workflow_delete', entityType: 'workflow', entityId: id, details: { name: workflow.name } });
  res.json({ ok: true });
}));

// Run a workflow
router.post('/:id/run', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const workflow = await prisma.workflow.findUnique({ where: { id } });
  if (!workflow) return res.status(404).json({ error: 'Workflow not found', code: 'not_found' });
  if (!workflow.isActive) return res.status(409).json({ error: 'Workflow is disabled', code: 'workflow_disabled' });

  const start = Date.now();
  const run = await prisma.workflowRun.create({
    data: { workflowId: id, input: req.body || {}, status: 'running' },
  });

  const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
  const results = [];
  let status = 'success';
  let error = null;

  for (const step of steps) {
    try {
      // Execute step action (placeholder — real execution in future)
      results.push({ step: step.label || step.action, status: 'ok', detail: `Executed ${step.action}` });
    } catch (e) {
      results.push({ step: step.label || step.action, status: 'error', detail: e.message });
      status = 'failed';
      error = e.message;
      break;
    }
  }

  const duration = Date.now() - start;
  const updated = await prisma.workflowRun.update({
    where: { id: run.id },
    data: { status, output: { results }, error, duration },
  });

  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'workflow_run', entityType: 'workflow', entityId: id, details: { runId: run.id, status, duration } });
  res.json(updated);
}));

// List runs for a workflow
router.get('/:id/runs', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const runs = await prisma.workflowRun.findMany({
    where: { workflowId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(runs);
}));

// Compile/validate a workflow definition as a DAG
router.post('/:id/compile', authenticate, requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const w = await prisma.workflow.findUnique({ where: { id } });
  if (!w) return res.status(404).json({ error: 'Workflow not found', code: 'not_found' });
  res.json(compile(w.steps));
}));

// Run a workflow as a DAG with tracing
router.post('/:id/run-dag', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const w = await prisma.workflow.findUnique({ where: { id } });
  if (!w) return res.status(404).json({ error: 'Workflow not found', code: 'not_found' });
  if (!w.isActive) return res.status(409).json({ error: 'Workflow disabled', code: 'disabled' });
  const compiled = compile(w.steps);
  if (!compiled.ok) return res.status(400).json({ error: 'Invalid workflow', details: compiled.errors });
  const start = Date.now();
  const run = await prisma.workflowRun.create({ data: { workflowId: id, status: 'running', input: req.body || null } });
  const handlers = { default: async (node) => ({ executed: true, type: node.type, label: node.label || node.id }) };
  const result = await runDag(compiled.dag, handlers, { topologicalOrder: compiled.topologicalOrder });
  const updated = await prisma.workflowRun.update({
    where: { id: run.id },
    data: { status: result.status, output: result, duration: result.duration, ...(result.status === 'failed' ? { error: result.results.find((r) => r.status === 'failed')?.error } : {}) },
  });
  res.json(updated);
}));

export default router;
