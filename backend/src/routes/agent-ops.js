import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();
const ADMIN = ['admin', 'developer'];

// Telemetry listing
router.get('/telemetry', authenticate, requireRole(...ADMIN), asyncHandler(async (req, res) => {
  const events = await prisma.telemetryEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { agent: { select: { id: true, name: true } } } });
  res.json(events);
}));

// Genesis: create an agent from a manifest (validated)
router.post('/genesis/create', authenticate, requireRole(...ADMIN), asyncHandler(async (req, res) => {
  const { name, description, systemPrompt, mode, tools, model, safetyConstraints } = req.body || {};
  if (!name || !systemPrompt) return res.status(400).json({ error: 'name and systemPrompt required', code: 'bad_request' });
  try {
    const agent = await prisma.agent.create({
      data: { name, description: description || null, systemPrompt, mode: mode || 'primary', tools: tools || [], model: model || null, isActive: false },
    });
    res.status(201).json({ agent, note: 'Created inactive. Review and activate manually (Genesis safety).' });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Agent name already exists', code: 'conflict' });
    throw e;
  }
}));

// Optimizer: trigger benchmark (stub)
router.post('/optimize/:agentId', authenticate, requireRole(...ADMIN), asyncHandler(async (req, res) => {
  const agentId = String(req.params.agentId).slice(0, 100);
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return res.status(404).json({ error: 'Agent not found', code: 'not_found' });
  const benchmark = await prisma.agentBenchmark.create({
    data: { agentId, candidateConfig: req.body || {}, status: 'running' },
  });
  // Stub: mark completed immediately
  const updated = await prisma.agentBenchmark.update({ where: { id: benchmark.id }, data: { status: 'completed', score: 0.5, results: { note: 'stub benchmark' } } });
  res.json(updated);
}));

export default router;
EOF
echo done