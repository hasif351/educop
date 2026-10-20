import "server-only";
import { db } from "./db";
import type { SessionPayload } from "./session";

/** Classes the teacher owns, each with its lessons, for the assignment builder. */
export async function builderClasses(s: SessionPayload & { schoolId: string }) {
  return db.class.findMany({
    where: { schoolId: s.schoolId, teacherId: s.userId },
    select: { id: true, name: true, lessons: { select: { id: true, title: true }, orderBy: { scheduledFor: "desc" } } },
    orderBy: { name: "asc" },
  });
}
