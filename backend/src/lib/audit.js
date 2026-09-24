// Lightweight audit helper — writes a structured AuditLog row (best-effort, never
// throws to a caller). Sensitive admin/money actions go through this.
import prisma from './prisma.js';

export async function audit({ actorId, actorEmail, action, entityType, entityId, details }) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        actorEmail: actorEmail || null,
        action,
        entityType,
        entityId: entityId || null,
        details: details === undefined ? undefined : details,
      },
    });
  } catch (e) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'audit write failed', action, entityType, err: e?.message }));
  }
}
