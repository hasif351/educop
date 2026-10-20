import "server-only";
import { db } from "./db";

export type NotifyKind = "class" | "assign" | "grade" | "ai" | "message" | "system";

/** Create in-app notifications. Respects nothing else yet: email/push delivery is a later phase. */
export async function notify(userIds: string[], n: { schoolId: string | null; kind: NotifyKind; title: string; body?: string; href?: string }) {
  if (userIds.length === 0) return;
  await db.notification.createMany({
    data: [...new Set(userIds)].map((userId) => ({ userId, schoolId: n.schoolId, kind: n.kind, title: n.title, body: n.body ?? "", href: n.href })),
  });
}

/** Verified parents of the given students. */
export async function parentsOf(studentIds: string[]) {
  const links = await db.parentStudent.findMany({ where: { studentId: { in: studentIds }, verified: true }, select: { parentId: true } });
  return links.map((l) => l.parentId);
}
