import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { hashPassword, comparePassword, signToken } from '../lib/auth.js';

const router = Router();

const registerSchema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6), phone: z.string().optional() });
const loginSchema = z.object({ email: z.string().email(), password: z.string() });

router.post('/register', async (req, res) => {
  const { name, email, password, phone } = registerSchema.parse(req.body);
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(409).json({ error: 'Email already registered' });
  const user = await prisma.user.create({ data: { name, email, password: await hashPassword(password), phone, role: 'customer' } });
  const token = signToken(user);
  res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

router.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await comparePassword(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

router.get('/me', async (req, res) => {
  const header = req.headers.authorization;
  if (!header) return res.json({ user: null });
  try {
    const { verifyToken } = await import('../lib/auth.js');
    const payload = verifyToken(header.replace('Bearer ', ''));
    const user = await prisma.user.findUnique({ where: { id: payload.id }, select: { id: true, name: true, email: true, role: true } });
    res.json({ user });
  } catch { res.json({ user: null }); }
});

export default router;
