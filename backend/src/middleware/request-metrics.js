// Request timing + metrics collection middleware.
import { recordRequest } from '../services/metrics.js';
import { correlationId } from './correlation-id.js';

export function requestMetrics(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    // Normalize path (strip IDs for grouping)
    const normalized = req.path.replace(/\/[0-9a-f-]{20,}/g, '/:id').replace(/\/[a-z0-9-]{20,}/g, '/:id');
    recordRequest(normalized, res.statusCode, duration);
  });
  next();
}
