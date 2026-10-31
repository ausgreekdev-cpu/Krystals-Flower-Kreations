// Request metrics collection (in-memory, resets on restart).
// Tracks request counts, error rates, and latency percentiles.
const metrics = {
  requests: 0,
  errors: 0,
  byPath: new Map(),
  latencies: [],
  MAX_LATENCIES: 1000,
};

export function recordRequest(path, statusCode, durationMs) {
  metrics.requests++;
  if (statusCode >= 400) metrics.errors++;
  const key = `${path}`;
  if (!metrics.byPath.has(key)) metrics.byPath.set(key, { count: 0, errors: 0, totalMs: 0 });
  const entry = metrics.byPath.get(key);
  entry.count++;
  if (statusCode >= 400) entry.errors++;
  entry.totalMs += durationMs;
  // Track latencies (capped)
  metrics.latencies.push(durationMs);
  if (metrics.latencies.length > metrics.MAX_LATENCIES) metrics.latencies.shift();
}

export function getMetrics() {
  const sorted = [...metrics.latencies].sort((a, b) => a - b);
  const p = (pct) => sorted.length ? sorted[Math.floor(sorted.length * pct)] : 0;
  return {
    totalRequests: metrics.requests,
    totalErrors: metrics.errors,
    errorRate: metrics.requests > 0 ? Math.round((metrics.errors / metrics.requests) * 10000) / 100 : 0,
    latency: {
      p50: p(0.5),
      p95: p(0.95),
      p99: p(0.99),
      avg: sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
      max: sorted.length ? sorted[sorted.length - 1] : 0,
    },
    byPath: Object.fromEntries(
      [...metrics.byPath.entries()].map(([path, d]) => [path, {
        count: d.count,
        errors: d.errors,
        avgMs: d.count > 0 ? Math.round(d.totalMs / d.count) : 0,
      }])
    ),
    collectedAt: new Date().toISOString(),
  };
}

export function resetMetrics() {
  metrics.requests = 0;
  metrics.errors = 0;
  metrics.byPath.clear();
  metrics.latencies = [];
}
