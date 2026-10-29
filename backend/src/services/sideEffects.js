// Centralized side-effect runner (item 5): wraps fire-and-forget operations
// with structured error logging, retry, and dead-letter tracking.
// Failures are persisted to the audit log with action 'side_effect_failed'
// so they can be reviewed and retried from the admin panel.
import prisma from '../lib/prisma.js';
import { audit } from '../lib/audit.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Sleep helper
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Run a side effect with retry and structured error logging.
// Returns { ok: boolean, result?, error? }
export async function runSideEffect(name, fn, { retries = MAX_RETRIES, critical = false, context = {} } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) {
        console.info(JSON.stringify({ level: 'info', msg: 'side_effect_recovered', name, attempt, context }));
      }
      return { ok: true, result };
    } catch (e) {
      lastError = e;
      console.error(JSON.stringify({ level: 'error', msg: 'side_effect_failed', name, attempt, retries, err: e?.message, context }));
      if (attempt < retries) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  // All retries exhausted — persist to audit log as dead letter
  try {
    await audit({
      actorId: context.userId || null,
      action: 'side_effect_failed',
      entityType: context.entityType || 'system',
      entityId: context.entityId || 'unknown',
      details: { name, error: lastError?.message, retries, critical, context, failedAt: new Date().toISOString() },
    });
  } catch {}

  return { ok: false, error: lastError?.message };
}

// List failed side effects from the audit log
export async function getFailedSideEffects(limit = 50) {
  const rows = await prisma.auditLog.findMany({
    where: { action: 'side_effect_failed' },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows;
}

// Retry a specific failed side effect by its audit log ID
export async function retrySideEffect(auditId) {
  const row = await prisma.auditLog.findUnique({ where: { id: auditId } });
  if (!row || row.action !== 'side_effect_failed') return null;
  const { name, context } = row.details || {};
  // Re-run is caller's responsibility — just mark as retried
  await prisma.auditLog.update({
    where: { id: auditId },
    data: { action: 'side_effect_retried', details: { ...row.details, retriedAt: new Date().toISOString() } },
  });
  return { name, context, auditId };
}
