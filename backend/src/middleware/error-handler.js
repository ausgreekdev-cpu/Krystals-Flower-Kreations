// Central error handler — structured codes, no stack leak in prod, Prisma mapping
import { isProductionLike } from '../lib/auth.js';
export function notFound(req, res) {
  res.status(404).json({ error: 'Not found', code: 'not_found', path: req.originalUrl });
}

export function errorHandler(err, req, res, _next) {
  const requestId = req.id || req.headers['x-request-id'] || undefined;

  // Prisma known errors
  if (err.code === 'P2002') {
    // Unique constraint
    const target = err.meta?.target || 'field';
    return res.status(409).json({ error: `Conflict: ${target} already exists`, code: 'conflict', target, requestId });
  }
  if (err.code === 'P2003') {
    return res.status(400).json({ error: 'Invalid reference (foreign key)', code: 'invalid_reference', requestId });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found', code: 'not_found', requestId });
  }
  // Bad enum/date/type in a query → client error, not a 500
  if (err.name === 'PrismaClientValidationError') {
    return res.status(400).json({ error: 'Invalid request parameters', code: 'validation_failed', requestId });
  }

  // Zod
  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation failed', code: 'validation_failed', details: err.flatten?.() || err.issues, requestId });
  }

  // JWT
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token', code: 'unauthorized', requestId });
  }

  // Multer
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (max 5MB)', code: 'file_too_large', requestId });
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Too many files (max 5)', code: 'too_many_files', requestId });
  }

  const status = err.status || err.statusCode || 500;
  const isServerError = status >= 500;
  const prod = isProductionLike();
  // Only our own string codes reach the client — never Prisma/driver codes like P1001
  const safeCode = typeof err.code === 'string' && !/^P\d{4}$/.test(err.code) && /^[a-z_]+$/.test(err.code) ? err.code : null;

  if (isServerError) {
    console.error(`[${requestId || 'no-id'}] ${req.method} ${req.originalUrl} -> ${status}`, err.message);
    console.error(err.stack);
  }

  // err.expose lets intentional 5xx (e.g. storage not configured) show their message
  const message = isServerError && prod && !err.expose
    ? 'Internal server error'
    : (err.message || 'Internal error');

  res.status(status).json({
    error: message,
    code: safeCode || (isServerError ? 'internal_error' : 'bad_request'),
    requestId,
    ...(!prod && isServerError ? { stack: String(err.stack || '').slice(0, 2000) } : {}),
  });
}

export default errorHandler;
