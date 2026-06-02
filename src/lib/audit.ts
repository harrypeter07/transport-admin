import "server-only";
import { prisma } from "@/lib/db";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "OPTIMIZE" | "PUBLISH";
export type AuditEntity = "Employee" | "Cab" | "Route" | "Shift" | "SystemSettings" | "Leave" | "User";

export async function audit(opts: {
  userId?: string;
  role?: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: opts.userId || null,
        role: opts.role || null,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId || null,
        before: opts.before ?? undefined,
        after: opts.after ?? undefined,
        ip: opts.ip || null,
      },
    });
  } catch (e) {
    console.error("[audit] Failed to write audit log:", e);
  }
}
