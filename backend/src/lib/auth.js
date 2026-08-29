import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from './prisma.js';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'dev-secret-change-me') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production — generate with: openssl rand -base64 48');
    }
    return 'dev-secret-change-me';
  }
  return secret;
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const ROLE_RANK = {
  customer: 1,
  staff: 2,
  maker: 2,
  admin: 3,
  developer: 4,
};

export function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, getJwtSecret());
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Authenticate: header-only, no query.token (prevents log leak), DB lookup to ensure user still exists
export async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token', code: 'unauthorized' });
  }
  try {
    const payload = verifyToken(header.slice(7));
    // DB lookup ensures revoked/deleted users are rejected and role is fresh
    const user = await prisma.user.findUnique({ where: { id: payload.id }, select: { id: true, email: true, role: true, name: true } });
    if (!user) return res.status(401).json({ error: 'User not found', code: 'unauthorized' });
    req.user = user;
    // also keep raw payload for backwards compat
    req.tokenPayload = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'token_expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token', code: 'invalid_token' });
    }
    return res.status(401).json({ error: 'Invalid token', code: 'invalid_token' });
  }
}

// Aliases for backwards compat
export const requireAuth = authenticate;

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden', code: 'forbidden', required: roles });
    }
    next();
  };
}

export function requireRole(...roles) {
  return authorize(...roles);
}

export function roleAtLeast(minRole) {
  const minRank = ROLE_RANK[minRole] || 0;
  return (req, res, next) => {
    const rank = ROLE_RANK[req.user?.role] || 0;
    if (rank < minRank) {
      return res.status(403).json({ error: 'Forbidden: requires ' + minRole, code: 'forbidden', required: minRole });
    }
    next();
  };
}

export { getJwtSecret };
