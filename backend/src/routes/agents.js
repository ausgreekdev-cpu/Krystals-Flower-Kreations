// In-app agent registry + runner (Phase 1-2 of agent system).
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { audit } from '../lib/audit.js';
import { llmAvailable } from '../services/llm.js';

const router = Router();
const EDITOR_ROLES = ['admin', 'developer', 'maker', 'staff'];
const ADMIN_ROLES = ['admin', 'developer'];

const agentSchema = z.object({
  name: z.string().min(2).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  description: z.string().max(500).optional().nullable(),
  systemPrompt: z.string().min(10).max(10000),
  mode: z.enum(['primary', 'subagent']).default('primary'),
  tools: z.array(z.string()).max(50).optional(),
  model: z.string().max(100).optional().nullable(),
  isActive: z.boolean().optional(),
}).strict();

const runSchema = z.object({
  input: z.string().min(1).max(10000),
}).strict();

// List agents
router.get('/', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const agents = await prisma.agent.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { runs: true } } },
  });
  res.json(agents);
}));

// Get single agent with recent runs
router.get('/:id', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const agent = await prisma.agent.findUnique({
    where: { id },
    include: { runs: { orderBy: { createdAt: 'desc' }, take: 10 } },
  });
  if (!agent) return res.status(404).json({ error: 'Agent not found', code: 'not_found' });
  res.json(agent);
}));

// Create agent
router.post('/', authenticate, requireRole(...ADMIN_ROLES), validate(agentSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  try {
    const agent = await prisma.agent.create({
      data: {
        name: data.name,
        description: data.description || null,
        systemPrompt: data.systemPrompt,
        mode: data.mode,
        tools: data.tools || [],
        model: data.model || null,
        isActive: data.isActive ?? true,
      },
    });
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'agent_create', entityType: 'agent', entityId: agent.id, details: { name: agent.name } });
    res.status(201).json(agent);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Agent name already exists', code: 'conflict' });
    throw e;
  }
}));

// Update agent
router.patch('/:id', authenticate, requireRole(...ADMIN_ROLES), validate(agentSchema.partial().strict(), { partial: true }), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const existing = await prisma.agent.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Agent not found', code: 'not_found' });
  const data = req.validated;
  const agent = await prisma.agent.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.systemPrompt !== undefined ? { systemPrompt: data.systemPrompt } : {}),
      ...(data.mode !== undefined ? { mode: data.mode } : {}),
      ...(data.tools !== undefined ? { tools: data.tools } : {}),
      ...(data.model !== undefined ? { model: data.model } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'agent_update', entityType: 'agent', entityId: id, details: { fields: Object.keys(data) } });
  res.json(agent);
}));

// Delete agent
router.delete('/:id', authenticate, requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) return res.status(404).json({ error: 'Agent not found', code: 'not_found' });
  await prisma.agent.delete({ where: { id } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'agent_delete', entityType: 'agent', entityId: id, details: { name: agent.name } });
  res.json({ ok: true });
}));

// Run an agent
router.post('/:id/run', authenticate, requireRole(...EDITOR_ROLES), validate(runSchema), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) return res.status(404).json({ error: 'Agent not found', code: 'not_found' });
  if (!agent.isActive) return res.status(409).json({ error: 'Agent is disabled', code: 'agent_disabled' });

  const start = Date.now();
  const run = await prisma.agentRun.create({
    data: { agentId: id, input: req.validated.input, status: 'running' },
  });

  // Execute via LLM
  let output = null;
  let error = null;
  let status = 'success';
  try {
    if (llmAvailable()) {
      const { llmText } = await import('../services/llm.js');
      output = await llmText({ system: agent.systemPrompt, user: req.validated.input, maxTokens: 2000 });
    } else {
      output = `[Agent "${agent.name}" is dormant — no LLM provider configured. Set LLM_API_KEY to enable.]`;
    }
  } catch (e) {
    error = e?.message || String(e);
    status = 'failed';
  }

  const duration = Date.now() - start;
  const updated = await prisma.agentRun.update({
    where: { id: run.id },
    data: { output, error, status, duration },
  });

  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'agent_run', entityType: 'agent', entityId: id, details: { runId: run.id, status, duration } });
  res.json(updated);
}));

// List runs for an agent
router.get('/:id/runs', authenticate, requireRole(...EDITOR_ROLES), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const runs = await prisma.agentRun.findMany({
    where: { agentId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(runs);
}));

export default router;
