import { randomUUID } from 'node:crypto';

export function requestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] ? String(req.headers['x-request-id']).slice(0, 100) : randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = Date.now();
  // Avoid logging token query
  const safeUrl = req.originalUrl.replace(/token=[^&]+/gi, 'token=***');

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const log = {
      ts: new Date().toISOString(),
      requestId,
      method: req.method,
      path: safeUrl,
      status: res.statusCode,
      durationMs,
      ip: req.ip,
      userId: req.user?.id || undefined,
    };
    // Structured JSON to stdout — Netlify aggregates
    if (res.statusCode >= 500) console.error(JSON.stringify(log));
    else if (res.statusCode >= 400) console.warn(JSON.stringify(log));
    else console.log(JSON.stringify(log));
  });
  next();
}
export default requestLogger;
