import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Wrap query execution with retry on transient connection errors (common in
// serverless cold starts where the first DB connection may not be ready).
const originalQuery = prisma.$queryRaw.bind(prisma);
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 300;

async function withRetry(fn) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const msg = String(e?.message || '');
      const isTransient = /can.t reach database|connection.*refused|ECONNREFUSED|ETIMEDOUT|connection.*reset|too many connections/i.test(msg);
      if (!isTransient || attempt === MAX_RETRIES) throw e;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  throw lastError;
}

// Proxy prisma to retry on transient errors. We intercept the most common
// entry points (findUnique, findMany, create, update, delete, upsert, etc.)
// by wrapping the client in a Proxy.
const handler = {
  get(target, prop) {
    const val = target[prop];
    if (typeof val === 'function' && ['findUnique', 'findFirst', 'findMany', 'create', 'update', 'delete', 'upsert', 'count', 'aggregate', 'groupBy', 'createMany', 'updateMany', 'deleteMany'].includes(prop)) {
      return (...args) => withRetry(() => val(...args));
    }
    // Handle nested model accessors (e.g., prisma.product.create)
    if (val && typeof val === 'object' && !Array.isArray(val) && val !== null) {
      return new Proxy(val, {
        get(t, p) {
          const v = t[p];
          if (typeof v === 'function' && ['findUnique', 'findFirst', 'findMany', 'create', 'update', 'delete', 'upsert', 'count', 'aggregate', 'groupBy', 'createMany', 'updateMany', 'deleteMany'].includes(p)) {
            return (...args) => withRetry(() => v(...args));
          }
          return v;
        },
      });
    }
    return val;
  },
};

const proxiedPrisma = new Proxy(prisma, handler);

export default proxiedPrisma;
export { proxiedPrisma as prisma };