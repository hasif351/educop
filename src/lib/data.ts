import "server-only";
import { notFound } from "next/navigation";
import { db } from "./db";
import { percent } from "./grading";
import type { SessionPayload } from "./session";

// Tenant-scoped data access. Every query here filters by the caller's schoolId
// AND by their relationship to the record (enrolled, teaches, parent of), so a
// guessed id from another school or class returns nothing.

type S = SessionPayload & { schoolId: string };

const GST_OFFSET_MS = 4 * 3600_000;
/** Start and end of "today" in the school's time zone (Gulf Standard Time for the MVP). */
export function dayBounds(offsetDays = 0, now = new Date()) {
  const local = new Date(now.getTime() + GST_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  const start = new Date(local.getTime() - GST_OFFSET_MS + offsetDays * 86_400_000);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

// ---------------- Student ----------------

const enrolledIn = (s: S) => ({ schoolId: s.schoolId, enrollments: { some: { studentId: s.userId } } });

export async function studentDashboard(s: S) {
  const { start, end } = dayBounds();
  const classes = await db.class.findMany({ where: enrolledIn(s), include: { subject: true, teacher: { select: { name: true } } }, orderBy: { name: "asc" } });
  const classIds = classes.map((c) => c.id);

  const [todayLessons, pending, graded, recs, lessonCounts, doneCounts] = await Promise.all([
    db.lesson.findMany({
      where: { schoolId: s.schoolId, classId: { in: classIds }, status: "PUBLISHED", scheduledFor: { gte: start, lt: end } },
      include: { class: { include: { subject: true } }, progress: { where: { studentId: s.userId } } },
      orderBy: { scheduledFor: "asc" },
    }),
    db.assignment.findMany({
      where: { schoolId: s.schoolId, classId: { in: classIds }, status: "PUBLISHED", submissions: { none: { studentId: s.userId, status: { in: ["SUBMITTED", "GRADED"] } } } },
      include: { class: { include: { subject: true } } },
      orderBy: { dueAt: "asc" },
      take: 6,
    }),
    db.submission.findMany({
      where: { studentId: s.userId, assignment: { schoolId: s.schoolId }, status: { in: ["GRADED", "SUBMITTED"] } },
      include: { assignment: { include: { class: { include: { subject: true } } } } },
      orderBy: { submittedAt: "desc" },
      take: 5,
    }),
    db.recommendation.findMany({ where: { schoolId: s.schoolId, studentId: s.userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 4 }),
    db.lesson.groupBy({ by: ["classId"], where: { schoolId: s.schoolId, classId: { in: classIds }, status: "PUBLISHED", scheduledFor: { lt: end } }, _count: true }),
    db.lessonProgress.findMany({ where: { studentId: s.userId, completedAt: { not: null }, lesson: { classId: { in: classIds } } }, select: { lesson: { select: { classId: true } } } }),
  ]);

  const gradedAll = await db.submission.findMany({
    where: { studentId: s.userId, status: "GRADED", assignment: { schoolId: s.schoolId, classId: { in: classIds } } },
    select: { finalScore: true, maxScore: true, assignment: { select: { classId: true } } },
  });
  const progress = classes.map((c) => {
    const subs = gradedAll.filter((g) => g.assignment.classId === c.id);
    const score = subs.reduce((a, g) => a + (g.finalScore ?? 0), 0);
    const max = subs.reduce((a, g) => a + (g.maxScore ?? 0), 0);
    const total = lessonCounts.find((l) => l.classId === c.id)?._count ?? 0;
    const done = doneCounts.filter((d) => d.lesson.classId === c.id).length;
    return { cls: c, scorePct: percent(score, max), lessonsDone: done, lessonsTotal: total };
  });

  return { classes, todayLessons, pending, graded, recs, progress };
}

export async function studentLessons(s: S) {
  const { start } = dayBounds(-7);
  const { end } = dayBounds(7);
  return db.lesson.findMany({
    where: { schoolId: s.schoolId, status: "PUBLISHED", class: { enrollments: { some: { studentId: s.userId } } }, scheduledFor: { gte: start, lt: end } },
    include: { class: { include: { subject: true } }, progress: { where: { studentId: s.userId } } },
    orderBy: { scheduledFor: "desc" },
  });
}

export async function studentLesson(s: S, id: string) {
  const lesson = await db.lesson.findFirst({
    where: { id, schoolId: s.schoolId, status: "PUBLISHED", class: { enrollments: { some: { studentId: s.userId } } } },
    include: {
      class: { include: { subject: true, teacher: { select: { name: true } } } },
      progress: { where: { studentId: s.userId } },
      assignments: { where: { status: "PUBLISHED" }, select: { id: true, title: true } },
    },
  });
  if (!lesson) notFound();
  return lesson;
}

export async function studentAssignments(s: S) {
  return db.assignment.findMany({
    where: { schoolId: s.schoolId, status: "PUBLISHED", class: { enrollments: { some: { studentId: s.userId } } } },
    include: { class: { include: { subject: true } }, submissions: { where: { studentId: s.userId } }, _count: { select: { questions: true } } },
    orderBy: { dueAt: "desc" },
  });
}

/** Questions are returned without answer keys; marking happens on the server. */
export async function studentAssignment(s: S, id: string) {
  const a = await db.assignment.findFirst({
    where: { id, schoolId: s.schoolId, status: "PUBLISHED", class: { enrollments: { some: { studentId: s.userId } } } },
    include: {
      class: { include: { subject: true, teacher: { select: { name: true } } } },
      lesson: { select: { id: true, title: true } },
      questions: { orderBy: { order: "asc" }, select: { id: true, order: true, type: true, prompt: true, options: true, points: true } },
      submissions: { where: { studentId: s.userId }, include: { answers: true } },
    },
  });
  if (!a) notFound();
  const submission = a.submissions[0] ?? null;
  // Reveal correct answers only once the student has submitted.
  const key = submission && submission.status !== "IN_PROGRESS"
    ? await db.question.findMany({ where: { assignmentId: a.id }, select: { id: true, answerIndex: true } })
    : [];
  return { ...a, submission, key: new Map(key.map((k) => [k.id, k.answerIndex])) };
}

// ---------------- Parent ----------------

export async function parentChildren(s: S) {
  const links = await db.parentStudent.findMany({
    where: { parentId: s.userId, verified: true, student: { schoolId: s.schoolId } },
    include: { student: { select: { id: true, name: true, gradeLevel: true } } },
  });
  return Promise.all(links.map(async ({ student }) => {
    const [pending, graded] = await Promise.all([
      db.assignment.findMany({
        where: { schoolId: s.schoolId, status: "PUBLISHED", class: { enrollments: { some: { studentId: student.id } } }, submissions: { none: { studentId: student.id, status: { in: ["SUBMITTED", "GRADED"] } } } },
        include: { class: true }, orderBy: { dueAt: "asc" }, take: 5,
      }),
      db.submission.findMany({
        where: { studentId: student.id, status: "GRADED", assignment: { schoolId: s.schoolId } },
        include: { assignment: { include: { class: true } } }, orderBy: { gradedAt: "desc" }, take: 5,
      }),
    ]);
    return { student, pending, graded };
  }));
}

// ---------------- Teacher ----------------

const teaches = (s: S) => ({ schoolId: s.schoolId, teacherId: s.userId });

export async function teacherClasses(s: S) {
  return db.class.findMany({ where: teaches(s), include: { subject: true, _count: { select: { enrollments: true } } }, orderBy: { name: "asc" } });
}

export async function teacherDashboard(s: S) {
  const { start, end } = dayBounds();
  const classes = await teacherClasses(s);
  const classIds = classes.map((c) => c.id);
  const [today, toGrade, reviews, recent] = await Promise.all([
    db.lesson.findMany({ where: { schoolId: s.schoolId, classId: { in: classIds }, scheduledFor: { gte: start, lt: end } }, include: { class: true }, orderBy: { scheduledFor: "asc" } }),
    db.submission.findMany({
      where: { status: "SUBMITTED", assignment: { schoolId: s.schoolId, classId: { in: classIds } } },
      include: { student: { select: { name: true } }, assignment: { select: { id: true, title: true, class: { select: { name: true } } } } },
      orderBy: { submittedAt: "asc" },
    }),
    db.recommendation.findMany({
      where: { schoolId: s.schoolId, status: "PENDING_REVIEW", student: { enrollments: { some: { classId: { in: classIds } } } } },
      include: { student: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.assignment.findMany({
      where: { schoolId: s.schoolId, classId: { in: classIds }, status: "PUBLISHED" },
      include: { class: { select: { name: true, _count: { select: { enrollments: true } } } }, submissions: { select: { status: true, finalScore: true, maxScore: true } } },
      orderBy: { dueAt: "desc" },
      take: 6,
    }),
  ]);
  const needsSupport = await db.recommendation.findMany({
    where: { schoolId: s.schoolId, kind: "REVIEW", status: "ACTIVE", student: { enrollments: { some: { classId: { in: classIds } } } } },
    include: { student: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 6,
  });
  return { classes, today, toGrade, reviews, recent, needsSupport };
}

export async function teacherLessons(s: S) {
  return db.lesson.findMany({ where: { schoolId: s.schoolId, class: { teacherId: s.userId } }, include: { class: true, _count: { select: { progress: { where: { completedAt: { not: null } } } } } }, orderBy: { scheduledFor: "desc" } });
}

export async function teacherLesson(s: S, id: string) {
  const l = await db.lesson.findFirst({ where: { id, schoolId: s.schoolId, class: { teacherId: s.userId } }, include: { class: true } });
  if (!l) notFound();
  return l;
}

export async function teacherAssignments(s: S) {
  return db.assignment.findMany({
    where: { schoolId: s.schoolId, class: { teacherId: s.userId } },
    include: { class: { select: { name: true, _count: { select: { enrollments: true } } } }, submissions: { select: { status: true } }, _count: { select: { questions: true } } },
    orderBy: { dueAt: "desc" },
  });
}

export async function teacherAssignment(s: S, id: string) {
  const a = await db.assignment.findFirst({
    where: { id, schoolId: s.schoolId, class: { teacherId: s.userId } },
    include: {
      class: { include: { enrollments: { include: { student: { select: { id: true, name: true } } }, orderBy: { student: { name: "asc" } } } } },
      lesson: { select: { id: true, title: true } },
      questions: { orderBy: { order: "asc" }, include: { answers: { where: { submission: { status: { not: "IN_PROGRESS" } } }, select: { choiceIndex: true, autoScore: true } } } },
      submissions: { include: { answers: true } },
    },
  });
  if (!a) notFound();
  return a;
}

export async function teacherSubmission(s: S, assignmentId: string, submissionId: string) {
  const sub = await db.submission.findFirst({
    where: { id: submissionId, assignmentId, assignment: { schoolId: s.schoolId, class: { teacherId: s.userId } } },
    include: { student: { select: { name: true } }, answers: true, assignment: { include: { questions: { orderBy: { order: "asc" } } } } },
  });
  if (!sub) notFound();
  return sub;
}

// ---------------- Admin ----------------

export async function schoolOverview(s: S) {
  const [school, counts, classes, recentAudit] = await Promise.all([
    db.school.findUniqueOrThrow({ where: { id: s.schoolId }, include: { organization: true } }),
    db.user.groupBy({ by: ["role"], where: { schoolId: s.schoolId }, _count: true }),
    db.class.findMany({ where: { schoolId: s.schoolId }, include: { teacher: { select: { name: true } }, subject: true, _count: { select: { enrollments: true, lessons: true, assignments: true } } }, orderBy: { name: "asc" } }),
    db.auditLog.findMany({ where: { schoolId: s.schoolId }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  return { school, counts, classes, recentAudit };
}

export async function platformOverview() {
  return db.school.findMany({
    include: { organization: true, _count: { select: { users: true, classes: true, lessons: true, assignments: true } } },
    orderBy: { name: "asc" },
  });
}
