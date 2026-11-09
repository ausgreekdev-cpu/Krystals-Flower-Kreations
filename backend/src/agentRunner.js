import prisma from './lib/prisma.js';
import { audit } from './lib/audit.js';

export async function runWithPersistence({ type, name, input, fn }) {
  const started = Date.now();
  try {
    const result = await fn(input);
    await audit({ action: `${type}_run`, entityType: type, entityId: name, details: { status: 'success', duration: Date.now() - started, result } }).catch(() => {});
    return { ok: true, result, duration: Date.now() - started };
  } catch (e) {
    await prisma.dLQEntry.create({ data: { payload: { type, name, input }, error: String(e?.message || e) } }).catch(() => {});
    await audit({ action: `${type}_run`, entityType: type, entityId: name, details: { status: 'failed', duration: Date.now() - started, error: String(e?.message || e) } }).catch(() => {});
    throw e;
  }
}
