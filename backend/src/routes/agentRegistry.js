import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import { runWithPersistence } from '../agentRunner.js';
import * as skills from '../agents/skills/index.js';
import * as agents from '../agents/index.js';
import * as automations from '../automations/index.js';
import * as workflows from '../workflows/index.js';
import { getRunner } from '../workflows/runners/index.js';

const router = Router();
const ADMIN = ['admin', 'developer'];

router.get('/skills', authenticate, requireRole(...ADMIN), asyncHandler(async (req, res) => res.json(skills.listSkills())));
router.get('/agents', authenticate, requireRole(...ADMIN), asyncHandler(async (req, res) => res.json(agents.listAgents())));
router.get('/automations', authenticate, requireRole(...ADMIN), asyncHandler(async (req, res) => res.json(automations.listAutomations())));
router.get('/workflows', authenticate, requireRole(...ADMIN), asyncHandler(async (req, res) => res.json(workflows.listWorkflows())));

const runSchema = z.object({ type: z.enum(['skill','agent','automation','workflow']), name: z.string().min(1), input: z.any().optional() }).strict();

router.post('/run', authenticate, requireRole(...ADMIN), validate(runSchema), asyncHandler(async (req, res) => {
  const { type, name, input } = req.validated;
  let fn;
  if (type === 'skill') fn = async (i) => skills.runSkill(name, { input: i || {} });
  else if (type === 'agent') fn = async (i) => agents.runAgent(name, { input: i || {} });
  else if (type === 'automation') fn = async (i) => automations.runAutomation(name, i || {});
  else if (type === 'workflow') {
    const runner = getRunner(name);
    if (!runner) return res.status(400).json({ error: 'workflow runner not implemented', code: 'not_implemented' });
    fn = async () => runner(input);
  }
  const result = await runWithPersistence({ type, name, input, fn });
  res.json(result);
}));

export default router;
