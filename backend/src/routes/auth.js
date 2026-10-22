import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { hashPassword, comparePassword, signToken } from '../lib/auth.js';
import { awardSignupBonus } from '../services/loyaltyService.js';
import { sendPasswordReset } from '../services/email.js';
import { audit } from '../lib/audit.js';

const router = Router();
// bcrypt hash of a random string — used to equalise timing for unknown emails
const DUMMY_HASH = '$2a$10$GRwgh0oa6sCDg1McfoRJtuGsplBMy8w/bLUiOlUv5eB.0UTcibYoe';

const registerSchema = z.object({ name: z.string().min(2).max(100), email: z.string().email().max(254), password: z.string().min(6).max(128), phone: z.string().max(30).optional() }).strict();
const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(6).max(128) }).strict();
import { validate } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { asyncHandler } from '../middleware/async-handler.js';

router.post('/register', rateLimit('register', 5, 15), validate(registerSchema), asyncHandler(async (req, res) => {
  const { name, password, phone } = req.validated;
  const email = req.validated.email.trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(409).json({ error: 'Email already registered', code: 'conflict' });
  const user = await prisma.user.create({ data: { name: name.slice(0,100), email, password: await hashPassword(password), phone: phone?.slice(0,30), role: 'customer' } });
  // Welcome points (settings: loyalty_signup_bonus) — never blocks registration.
  const bonus = await awardSignupBonus(null, email).catch(() => null);
  const token = signToken(user);
  res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role }, ...(bonus ? { signupBonus: bonus.points, loyaltyPoints: bonus.newPoints } : {}) });
}));

// Per-IP limit + per-account limit (stops distributed guessing against one account)
const loginAccountLimit = rateLimit('login_account', 20, 15, (req) => typeof req.body?.email === 'string' ? req.body.email.trim() : null);
router.post('/login', rateLimit('login', 10, 15), loginAccountLimit, validate(loginSchema), asyncHandler(async (req, res) => {
  const { password } = req.validated;
  const email = req.validated.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  // Always run a bcrypt compare so response time doesn't reveal whether the email exists
  const ok = await comparePassword(password, user?.password || DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'Invalid credentials', code: 'unauthorized' });
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

// ── Self-service password reset ────────────────────────────────────────────
// The emailed value is 32 random bytes; only its sha256 is stored, so a leaked
// database row can't be turned into a working link. Single-use + 60 minutes.
// Responses never reveal whether an email is registered (no enumeration oracle).
const RESET_TTL_MINUTES = 60;
const RESET_TTL_MS = RESET_TTL_MINUTES * 60 * 1000;
const sha256 = (v) => createHash('sha256').update(v).digest('hex');
function frontendOrigin() {
  const raw = (process.env.FRONTEND_URL || 'https://krystalsflowercreations.com.au').split(',')[0].trim();
  return raw.replace(/\/+$/, '');
}

const forgotSchema = z.object({ email: z.string().email().max(254) }).strict();
// Per-account ceiling on top of the per-IP one — stops a script mailing the same
// inbox (and filling the queue) over and over.
const forgotAccountLimit = rateLimit('password_reset_account', 5, 60, (req) =>
  typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null);

router.post('/forgot-password', rateLimit('password_reset', 8, 15), forgotAccountLimit, validate(forgotSchema), asyncHandler(async (req, res) => {
  const email = req.validated.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    // One live link at a time: asking again invalidates the earlier email.
    await prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    const raw = randomBytes(32).toString('base64url');
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    const resetUrl = `${frontendOrigin()}/reset-password?token=${encodeURIComponent(raw)}`;
    await sendPasswordReset(user, { resetUrl, ttlMinutes: RESET_TTL_MINUTES }).catch(() => null);
    audit({ actorId: user.id, actorEmail: user.email, action: 'password_reset_requested', entityType: 'user', entityId: user.id });
  }
  res.json({ ok: true, message: 'If that email has an account, a reset link is on its way.' });
}));

const resetSchema = z.object({
  token: z.string().min(20).max(200),
  // 8+ for a brand-new password (registration still allows 6 — existing accounts
  // keep working; the reset flow is free to raise the floor).
  password: z.string().min(8).max(128),
}).strict();

router.post('/reset-password', rateLimit('password_reset_submit', 10, 15), validate(resetSchema), asyncHandler(async (req, res) => {
  const { token, password } = req.validated;
  const invalid = () => res.status(400).json({
    error: 'This reset link is invalid or has expired — request a new one.',
    code: 'invalid_reset_token',
  });

  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt <= new Date()) return invalid();

  // Claim before writing: a double-submit can't spend the same token twice.
  const claimed = await prisma.passwordResetToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (!claimed.count) return invalid();

  const user = await prisma.user.update({
    where: { id: row.userId },
    data: { password: await hashPassword(password) },
    select: { id: true, email: true, name: true, role: true },
  });
  // Any other outstanding link for this account dies with the reset.
  await prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  audit({ actorId: user.id, actorEmail: user.email, action: 'password_reset_completed', entityType: 'user', entityId: user.id });

  // Sign them straight in — the reset proves control of the inbox.
  res.json({ ok: true, token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));

// Sliding session — issue a fresh token while the current one is still valid.
// authenticate() re-reads the user from the DB, so role changes take effect
// at renewal. Called by the storefront on load (and can be called by the
// mobile app) to keep short-lived tokens out of long-lived storage.
router.post('/refresh', authenticate, asyncHandler(async (req, res) => {
  res.json({ token: signToken(req.user), user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role } });
}));

// GDPR deletion — delete own account + anonymize orders/bookings
import { authenticate } from '../lib/auth.js';
router.delete('/me', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  await prisma.user.update({ where: { id: userId }, data: { email: `deleted_${userId}@deleted.local`, name: 'Deleted User', phone: null, password: 'deleted' } });
  res.json({ ok: true, message: 'Account anonymized per GDPR' });
}));

export default router;
