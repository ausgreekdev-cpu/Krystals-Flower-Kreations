import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { runSandbox } from '../agents/remediate/sandbox-runner.js';

const router = Router();
const ADMIN = ['admin', 'developer'];

const MAX_FILES = 5;
const MAX_LINES = 200;

function safetyGate(diff) {
  const issues = [];
  const files = (diff.match(/^---\s|^diff --git/gm) || []).length;
  const lines = diff.split('\n').length;
  if (files > MAX_FILES) issues.push(`Too many files (${files} > ${MAX_FILES})`);
  if (lines > MAX_LINES) issues.push(`Too many lines (${lines} > ${MAX_LINES})`);
  if (/\.env|secret|password|token/i.test(diff)) issues.push('Patch touches sensitive keywords');
  if (/auth|login|session/i.test(diff) && /delete|drop/i.test(diff)) issues.push('Patch modifies auth/destructive logic');
  return { safe: issues.length === 0, issues };
}

router.get('/', authenticate, requireRole(...ADMIN), asyncHandler(async (req, res) => {
  const proposals = await prisma.patchProposal.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { incident: { select: { id: true, title: true, severity: true } } } });
  res.json(proposals);
}));

router.get('/:id', authenticate, requireRole(...ADMIN), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const p = await prisma.patchProposal.findUnique({ where: { id }, include: { incident: true } });
  if (!p) return res.status(404).json({ error: 'Patch not found', code: 'not_found' });
  res.json(p);
}));

// Create a patch proposal from an incident (LLM-assisted stub)
router.post('/', authenticate, requireRole(...ADMIN), asyncHandler(async (req, res) => {
  const { incidentId, branchName, diff } = req.body || {};
  if (!incidentId || !diff) return res.status(400).json({ error: 'incidentId and diff required', code: 'bad_request' });
  const gate = safetyGate(diff);
  const proposal = await prisma.patchProposal.create({
    data: { incidentId, branchName: branchName || `fix/incident-${incidentId}`, diff, status: gate.safe ? 'pending' : 'failed', testResults: gate.safe ? null : { safety: gate.issues } },
  });
  res.status(201).json({ proposal, safety: gate });
}));

// Run sandbox (stub: marks as testing, then passed if safe)
router.post('/:id/sandbox', authenticate, requireRole(...ADMIN), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const proposal = await prisma.patchProposal.findUnique({ where: { id } });
  if (!proposal) return res.status(404).json({ error: 'Patch not found', code: 'not_found' });
  const gate = safetyGate(proposal.diff);
  if (!gate.safe) {
    const updated = await prisma.patchProposal.update({ where: { id }, data: { status: 'failed', testResults: { safety: gate.issues } } });
    return res.json(updated);
  }
  const sandbox = await runSandbox(proposal.diff, proposal.branchName);
  const passed = sandbox.applied && sandbox.tests === 'passed';
  const updated = await prisma.patchProposal.update({
    where: { id },
    data: { status: passed ? 'passed' : 'failed', testResults: { safety: 'ok', sandbox } },
  });
  res.json(updated);
}));

// Open PR (stub: returns instructions, never auto-merges)
router.post('/:id/open-pr', authenticate, requireRole(...ADMIN), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const proposal = await prisma.patchProposal.findUnique({ where: { id } });
  if (!proposal) return res.status(404).json({ error: 'Patch not found', code: 'not_found' });
  if (proposal.status !== 'passed') return res.status(409).json({ error: 'Patch must pass sandbox first', code: 'not_ready' });
  const updated = await prisma.patchProposal.update({ where: { id }, data: { status: 'pr_opened', prUrl: `https://github.com/.../pull/ (manual)` } });
  res.json({ proposal: updated, note: 'Auto-merge disabled. Create PR manually from branch ' + proposal.branchName });
}));

export default router;
