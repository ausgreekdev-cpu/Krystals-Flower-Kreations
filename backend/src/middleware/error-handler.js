// Central error handler — structured codes, no stack leak in prod, Prisma mapping
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

  // Zod
  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation failed', code: 'validation_failed', details: err.flatten?.() || err.issues, requestId });
  }

  // JWT
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: err.message, code: 'unauthorized', requestId });
  }

  // Multer
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (max 5MB)', code: 'file_too_large', requestId });
  }
  if (err.message === 'File type not allowed') {
    return res.status(400).json({ error: 'File type not allowed', code: 'invalid_file_type', requestId });
  }

  const status = err.status || err.statusCode || 500;
  const isServerError = status >= 500;

  if (isServerError) {
    console.error(`[${requestId || 'no-id'}] ${req.method} ${req.originalUrl} -> ${status}`, err.message);
    if (process.env.NODE_ENV !== 'production') {
      console.error(err.stack);
    }
  }

  const message = isServerError && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : (err.message || 'Internal error');

  res.status(status).json({
    error: message,
    code: err.code || (isServerError ? 'internal_error' : 'bad_request'),
    requestId,
    ...(process.env.NODE_ENV !== 'production' && isServerError ? { stack: String(err.stack || '').slice(0, 2000) } : {}),
  });
}

export default errorHandler;
