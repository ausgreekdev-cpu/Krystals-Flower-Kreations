// Correlation ID middleware: assigns a unique ID to each request for tracing.
import { randomUUID } from 'crypto';

export function correlationId(req, res, next) {
  const id = req.headers['x-request-id'] || randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}
