import "server-only";
import { notFound } from "next/navigation";
import { db } from "./db";
import { dayBounds, studentDashboard } from "./data";
import { weekStart } from "./data-admin";
import type { SessionPayload } from "./session";

// Parent reads. A parent only ever sees children with a VERIFIED link in the
// parent's own school; any other child id is a 404.

type S = SessionPayload & { schoolId: string };

export async function parentChildList(s: S) {
  const links = await db.parentStudent.findMany({
    where: { parentId: s.userId, verified: true, student: { schoolId: s.schoolId, active: true } },
    include: { student: { select: { id: true, name: true, gradeLevel: true } } },
    orderBy: { student: { name: "asc" } },
  });
  return links.map((l) => l.student);
}

export async function pendingChildLinks(s: S) {
  return db.parentStudent.count({ where: { parentId: s.userId, verified: false } });
}

/** The verified child, or 404. */
export async function verifiedChild(s: S, childId: string) {
  const link = await db.parentStudent.findFirst({
    where: { parentId: s.userId, studentId: childId, verified: true, student: { schoolId: s.schoolId, active: true } },
    include: { student: { select: { id: true, name: true, gradeLevel: true } } },
  });
  if (!link) notFound();
  return link.student;
}

export async function childOverview(s: S, childId: string) {
  const child = await verifiedChild(s, childId);
  // The student dashboard query is scoped by schoolId + the student's own id, so
  // it can be reused once the parent link is verified above.
  const d = await studentDashboard({ ...s, userId: child.id, role: "STUDENT" });
  const classIds = d.classes.map((c) => c.id);
  const now = new Date();
  const [live, attended, wellbeing, badges] = await Promise.all([
    db.liveSession.findMany({ where: { schoolId: s.schoolId, classId: { in: classIds }, OR: [{ status: "ENDED" }, { startsAt: { lt: now }, status: { not: "SCHEDULED" } }] }, select: { id: true }, orderBy: { startsAt: "desc" }, take: 50 }),
    db.liveAttendance.findMany({ where: { userId: child.id, session: { schoolId: s.schoolId, classId: { in: classIds } } }, select: { sessionId: true } }),
    // Only entries the child chose to share with their parents.
    db.selCheckin.findMany({ where: { schoolId: s.schoolId, studentId: child.id, sharedWithParent: true }, select: { id: true, mood: true, feelings: true, note: true, scenario: true, response: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.studentBadge.findMany({ where: { studentId: child.id }, orderBy: { earnedAt: "desc" }, take: 6 }),
  ]);
  const upcoming = await db.liveSession.findMany({
    where: { schoolId: s.schoolId, classId: { in: classIds }, status: { in: ["SCHEDULED", "LIVE"] }, startsAt: { gte: dayBounds().start } },
    select: { id: true, title: true, startsAt: true }, orderBy: { startsAt: "asc" }, take: 3,
  });
  const liveIds = new Set(live.map((l) => l.id));
  const graded = d.graded.filter((g) => g.status === "GRADED");
  const teacherOf = new Map(d.classes.map((c) => [c.id, c.teacher.name]));
  return {
    child, ...d,
    upcomingWork: d.pending.filter((a) => a.dueAt >= now),
    missing: d.pending.filter((a) => a.dueAt < now),
    graded: graded.map((g) => ({ ...g, teacher: teacherOf.get(g.assignment.classId) ?? null })),
    live: { held: live.length, attended: attended.filter((a) => liveIds.has(a.sessionId)).length, upcoming },
    wellbeing, badges,
  };
}

/** This week's published lessons and active suggestions, the inputs for home activities. */
export async function homeLearningInputs(s: S, childId: string) {
  const child = await verifiedChild(s, childId);
  const start = weekStart();
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const [lessons, recs] = await Promise.all([
    db.lesson.findMany({
      where: { schoolId: s.schoolId, status: "PUBLISHED", scheduledFor: { gte: start, lt: end }, class: { enrollments: { some: { studentId: child.id } } } },
      select: { id: true, title: true, worksheet: true, nextActivity: true, scheduledFor: true, class: { select: { subject: { select: { name: true } } } } },
      orderBy: { scheduledFor: "asc" },
    }),
    db.recommendation.findMany({ where: { schoolId: s.schoolId, studentId: child.id, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const recLessons = await db.lesson.findMany({ where: { schoolId: s.schoolId, id: { in: recs.map((r) => r.lessonId ?? "") } }, select: { id: true, title: true } });
  return {
    child,
    lessons: lessons.map((l) => ({ id: l.id, title: l.title, subject: l.class.subject.name, worksheet: l.worksheet, nextActivity: l.nextActivity, scheduledFor: l.scheduledFor })),
    recs: recs.map((r) => ({ id: r.id, kind: r.kind, title: r.title, lessonTitle: recLessons.find((l) => l.id === r.lessonId)?.title ?? null })),
  };
}
