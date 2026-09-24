// Rate limiting.
//
// - globalRateLimit: coarse per-IP flood guard, in-memory per instance (a DB
//   write on every request would cost more than it protects).
// - rateLimit(name, ...): sensitive endpoints (login, register, checkout,
//   bookings, reviews). Uses a shared Postgres counter (RateLimitBucket) when
//   deployed, so limits hold across Netlify's many short-lived instances.
//   Local dev/tests use memory unless RATE_LIMIT_STORE=db.
import prisma from '../lib/prisma.js';
import { isProductionLike } from '../lib/auth.js';

// Client IP. On Netlify, x-nf-client-connection-ip is set by the edge and
// can't be spoofed by the caller; x-forwarded-for can be, so it's not trusted.
export function clientIp(req) {
  if (process.env.NETLIFY) {
    const nf = req.headers['x-nf-client-connection-ip'];
    if (nf) return String(nf).slice(0, 64);
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function useDbStore() {
  const v = process.env.RATE_LIMIT_STORE;
  if (v === 'db') return true;
  if (v === 'memory') return false;
  return isProductionLike();
}

function tooMany(res, retryAfter, name) {
  res.setHeader('Retry-After', String(Math.max(1, retryAfter)));
  return res.status(429).json({ error: `Too many requests${name ? ' for ' + name : ''} — try again in ${Math.max(1, retryAfter)}s`, code: 'rate_limited', retryAfter: Math.max(1, retryAfter) });
}

// ---- memory store ----
const mem = new Map(); // key -> { count, resetAt }
let lastSweep = Date.now();
function memHit(key, windowMs) {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, b] of mem) if (b.resetAt <= now) mem.delete(k);
  }
  let b = mem.get(key);
  if (!b || b.resetAt <= now) { b = { count: 0, resetAt: now + windowMs }; mem.set(key, b); }
  b.count += 1;
  return { count: b.count, resetAt: b.resetAt };
}

// ---- db store (fixed window) ----
async function dbHit(key, windowMs) {
  const now = Date.now();
  const windowIdx = Math.floor(now / windowMs);
  const resetAt = (windowIdx + 1) * windowMs;
  const id = `${key}:${windowIdx}`.slice(0, 255);
  const expiresAt = new Date(resetAt);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const row = await prisma.rateLimitBucket.upsert({
        where: { key: id },
        create: { key: id, count: 1, expiresAt },
        update: { count: { increment: 1 } },
        select: { count: true },
      });
      return { count: row.count, resetAt };
    } catch (e) {
      if (e?.code !== 'P2002' || attempt === 1) throw e; // concurrent first insert — retry as update
    }
  }
}

export function globalRateLimit(max = 300, windowMinutes = 1) {
  const windowMs = windowMinutes * 60 * 1000;
  return (req, res, next) => {
    if (req.path === '/health') return next();
    const { count, resetAt } = memHit(`global:${clientIp(req)}`, windowMs);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - count)));
    if (count > max) return tooMany(res, Math.ceil((resetAt - Date.now()) / 1000));
    next();
  };
}

/**
 * Per-endpoint limit.
 * @param {string} name        limiter name (part of the key)
 * @param {number} maxAttempts max hits per window
 * @param {number} windowMinutes
 * @param {(req) => string|null|undefined} [subjectFn] extra key subject (e.g. account email).
 *        When given, the limit applies per subject instead of per IP.
 */
export function rateLimit(name, maxAttempts, windowMinutes, subjectFn) {
  const windowMs = windowMinutes * 60 * 1000;
  return async (req, res, next) => {
    let subject = subjectFn ? subjectFn(req) : clientIp(req);
    if (!subject) return next();
    subject = String(subject).toLowerCase().slice(0, 200);
    const key = `${name}:${subject}`;
    let hit;
    try {
      hit = useDbStore() ? await dbHit(key, windowMs) : memHit(key, windowMs);
    } catch (e) {
      // Fail open to the in-memory limiter rather than blocking legit traffic on a DB hiccup
      console.warn(JSON.stringify({ level: 'warn', msg: 'rate-limit store error, using memory', limiter: name, err: e?.message }));
      hit = memHit(key, windowMs);
    }
    if (hit.count > maxAttempts) return tooMany(res, Math.ceil((hit.resetAt - Date.now()) / 1000), name);
    next();
  };
}

/** Delete expired DB buckets (called from the hourly scheduled function). */
export async function purgeExpiredRateLimits() {
  const { count } = await prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return count;
}

export default globalRateLimit;
