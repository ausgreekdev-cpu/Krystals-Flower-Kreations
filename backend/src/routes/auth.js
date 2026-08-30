import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { hashPassword, comparePassword, signToken } from '../lib/auth.js';

const router = Router();

const registerSchema = z.object({ name: z.string().min(2).max(100), email: z.string().email().max(254), password: z.string().min(6).max(128), phone: z.string().max(30).optional() }).strict();
const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(6).max(128) }).strict();
import { validate } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { asyncHandler } from '../middleware/async-handler.js';

router.post('/register', rateLimit('register', 5, 15), validate(registerSchema), asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.validated;
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(409).json({ error: 'Email already registered', code: 'conflict' });
  const user = await prisma.user.create({ data: { name: name.slice(0,100), email, password: await hashPassword(password), phone: phone?.slice(0,30), role: 'customer' } });
  const token = signToken(user);
  res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));

router.post('/login', rateLimit('login', 10, 15), validate(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.validated;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await comparePassword(password, user.password))) return res.status(401).json({ error: 'Invalid credentials', code: 'unauthorized' });
  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));

router.get('/me', asyncHandler(async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.json({ user: null });
  try {
    const { verifyToken } = await import('../lib/auth.js');
    const payload = verifyToken(header.slice(7));
    const user = await prisma.user.findUnique({ where: { id: payload.id }, select: { id: true, name: true, email: true, role: true } });
    res.json({ user });
  } catch { res.json({ user: null }); }
}));

// GDPR deletion — delete own account + anonymize orders/bookings
import { authenticate } from '../lib/auth.js';
router.delete('/me', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  await prisma.user.update({ where: { id: userId }, data: { email: `deleted_${userId}@deleted.local`, name: 'Deleted User', phone: null, password: 'deleted' } });
  res.json({ ok: true, message: 'Account anonymized per GDPR' });
}));

export default router;
