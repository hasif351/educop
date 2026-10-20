import { db } from "./db";

export async function audit(
  actor: { userId: string; schoolId: string | null },
  action: string,
  target?: string,
  meta?: Record<string, unknown>,
) {
  await db.auditLog.create({
    data: { actorId: actor.userId, schoolId: actor.schoolId, action, target, meta: meta as object | undefined },
  });
}
