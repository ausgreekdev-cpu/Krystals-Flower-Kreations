const ipBuckets = new Map(); // in-memory for global limit (per lambda instance)
const CLEAN_INTERVAL = 60 * 60 * 1000;
let lastClean = Date.now();

function cleanup() {
  if (Date.now() - lastClean < CLEAN_INTERVAL) return;
  lastClean = Date.now();
  const now = Date.now();
  for (const [ip, bucket] of ipBuckets) {
    if (now - bucket.windowStart > 60 * 1000) ipBuckets.delete(ip);
  }
}

// Global per-IP limit (generous, per instance)
export function globalRateLimit(max = 300, windowMinutes = 1) {
  const windowMs = windowMinutes * 60 * 1000;
  return (req, res, next) => {
    cleanup();
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const now = Date.now();
    let bucket = ipBuckets.get(ip);
    if (!bucket || now - bucket.windowStart > windowMs) {
      bucket = { count: 1, windowStart: now };
      ipBuckets.set(ip, bucket);
    } else {
      bucket.count += 1;
    }
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests', code: 'rate_limited', retryAfter });
    }
    next();
  };
}

// Per-route stricter limit (also in-memory, but distinct buckets by name)
// For distributed enforcement across Netlify lambdas, would need DB/Redis — documented as per-instance
export function rateLimit(name, maxAttempts, windowMinutes) {
  const windowMs = windowMinutes * 60 * 1000;
  const buckets = new Map();
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const key = `${name}:${ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart > windowMs) {
      bucket = { count: 1, windowStart: now };
      buckets.set(key, bucket);
    } else {
      bucket.count += 1;
    }
    if (bucket.count > maxAttempts) {
      const retryAfter = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests for ' + name, code: 'rate_limited', retryAfter });
    }
    next();
  };
}

export default globalRateLimit;
