import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { fingerprintIncident, severityFromStatus } from '../agents/sentinel/normalizer.js';

const router = Router();
const EDITOR = ['admin', 'developer', 'staff', 'maker'];
const ADMIN = ['admin', 'developer'];

const createSchema = z.object({
  source: z.enum(['frontend', 'backend']),
  title: z.string().min(1).max(200),
  stackTrace: z.string().max(10000).optional().nullable(),
  payload: z.any().optional(),
  statusCode: z.number().int().optional(),
  errorType: z.string().max(50).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
}).strict();

router.get('/', authenticate, requireRole(...EDITOR), asyncHandler(async (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const incidents = await prisma.incident.findMany({
    where: status ? { status } : undefined,
    orderBy: { lastSeenAt: 'desc' },
    take: 200,
    include: { patchProposals: { select: { id: true, status: true, prUrl: true } } },
  });
  res.json(incidents);
}));

router.get('/:id', authenticate, requireRole(...EDITOR), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const incident = await prisma.incident.findUnique({ where: { id }, include: { patchProposals: true } });
  if (!incident) return res.status(404).json({ error: 'Incident not found', code: 'not_found' });
  res.json(incident);
}));

router.post('/', authenticate, requireRole(...EDITOR), validate(createSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  const fp = fingerprintIncident({ source: data.source, title: data.title, stackTrace: data.stackTrace });
  const severity = data.severity || severityFromStatus(data.statusCode, data.errorType);
  const existing = await prisma.incident.findUnique({ where: { fingerprint: fp } });
  if (existing) {
    const updated = await prisma.incident.update({
      where: { id: existing.id },
      data: { count: existing.count + 1, lastSeenAt: new Date(), payload: data.payload ?? existing.payload, status: existing.status === 'resolved' ? 'open' : existing.status },
    });
    return res.json(updated);
  }
  const created = await prisma.incident.create({
    data: { fingerprint: fp, source: data.source, title: data.title, stackTrace: data.stackTrace || null, payload: data.payload ?? null, severity, status: 'open' },
  });
  res.status(201).json(created);
}));

const patchSchema = z.object({
  status: z.enum(['open', 'investigating', 'resolved', 'ignored']).optional(),
}).strict();

router.patch('/:id', authenticate, requireRole(...ADMIN), validate(patchSchema, { partial: true }), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0, 100);
  const data = req.validated;
  const updated = await prisma.incident.update({
    where: { id },
    data: { ...data, ...(data.status === 'resolved' ? { resolvedAt: new Date() } : {}) },
  });
  res.json(updated);
}));

export default router;
