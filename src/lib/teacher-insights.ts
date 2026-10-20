import "server-only";
import { notFound } from "next/navigation";
import type { RecommendationStatus } from "@prisma/client";
import { db } from "./db";
import { dayBounds } from "./data";
import { masteryLevel, pooledPct, supportReasons, trend, type Level, type Trend } from "./progress";
import type { SessionPayload } from "./session";

// Teacher-only reads for student progress and recommendations. Same rule as
// data.ts: every query is scoped by schoolId AND the teacher's own classes.

type S = SessionPayload & { schoolId: string };

/** Students enrolled in at least one of this teacher's classes. */
export const inMyClasses = (s: S) => ({ enrollments: { some: { class: { schoolId: s.schoolId, teacherId: s.userId } } } });

export type StudentRow = {
  id: string; name: string;
  avgPct: number | null; lessonsDone: number; lessonsTotal: number; missing: number;
  trend: Trend | null; reasons: string[];
  mastery: Record<string, { pct: number; level: Level } | undefined>;
};
export type ObjectiveCol = { code: string; title: string; avgPct: number | null; secure: number; withData: number };
export type ClassStats = { id: string; name: string; subject: string; gradeLevel: number; students: StudentRow[]; objectives: ObjectiveCol[]; avgPct: number | null };

/** Progress for each of the teacher's classes (or just the ones asked for). */
export async function classStats(s: S, onlyClassId?: string): Promise<ClassStats[]> {
  const classes = await db.class.findMany({
    where: { schoolId: s.schoolId, teacherId: s.userId, ...(onlyClassId ? { id: onlyClassId } : {}) },
    include: { subject: { select: { name: true } }, enrollments: { include: { student: { select: { id: true, name: true } } }, orderBy: { student: { name: "asc" } } } },
    orderBy: { name: "asc" },
  });
  if (classes.length === 0) return [];
  const classIds = classes.map((c) => c.id);
  const studentIds = [...new Set(classes.flatMap((c) => c.enrollments.map((e) => e.studentId)))];
  const { end } = dayBounds();
  const now = new Date();
  const since = new Date(now.getTime() - 14 * 86_400_000);

  const [lessons, assignments, reviews, lowMood] = await Promise.all([
    db.lesson.findMany({
      where: { schoolId: s.schoolId, classId: { in: classIds }, status: "PUBLISHED" },
      select: { id: true, classId: true, title: true, outcomeCode: true, scheduledFor: true, progress: { select: { studentId: true, completedAt: true, checkCorrect: true, checkTotal: true } } },
      orderBy: { scheduledFor: "asc" },
    }),
    db.assignment.findMany({
      where: { schoolId: s.schoolId, classId: { in: classIds }, status: "PUBLISHED" },
      select: { id: true, classId: true, lessonId: true, dueAt: true, submissions: { select: { studentId: true, status: true, finalScore: true, maxScore: true } } },
      orderBy: { dueAt: "asc" },
    }),
    db.recommendation.groupBy({ by: ["studentId"], where: { schoolId: s.schoolId, studentId: { in: studentIds }, kind: "REVIEW", status: "ACTIVE" }, _count: true }),
    // Only check-ins the student chose to share with their teacher.
    db.selCheckin.groupBy({ by: ["studentId"], where: { schoolId: s.schoolId, studentId: { in: studentIds }, shared: true, mood: { lte: 2 }, createdAt: { gte: since } }, _count: true }),
  ]);
  const reviewCount = new Map(reviews.map((r) => [r.studentId, r._count]));
  const moodCount = new Map(lowMood.map((r) => [r.studentId, r._count]));

  return classes.map((c) => {
    const cLessons = lessons.filter((l) => l.classId === c.id);
    const taught = cLessons.filter((l) => l.scheduledFor < end);
    const cAssign = assignments.filter((a) => a.classId === c.id);
    const codeOf = new Map(cLessons.filter((l) => l.outcomeCode).map((l) => [l.id, l.outcomeCode!]));
    const codes = [...new Set(cLessons.flatMap((l) => (l.outcomeCode ? [l.outcomeCode] : [])))];

    const students: StudentRow[] = c.enrollments.map(({ student }) => {
      const graded = cAssign.flatMap((a) => a.submissions.filter((x) => x.studentId === student.id && x.status === "GRADED" && x.maxScore).map((x) => ({ a, score: x.finalScore ?? 0, max: x.maxScore! })));
      const missing = cAssign.filter((a) => a.dueAt < now && !a.submissions.some((x) => x.studentId === student.id && x.status !== "IN_PROGRESS")).length;
      const lessonsDone = taught.filter((l) => l.progress.some((p) => p.studentId === student.id && p.completedAt)).length;
      const avgPct = pooledPct(graded);
      const mastery: StudentRow["mastery"] = {};
      for (const code of codes) {
        const parts = [
          ...graded.filter((g) => g.a.lessonId && codeOf.get(g.a.lessonId) === code),
          ...cLessons.filter((l) => l.outcomeCode === code).flatMap((l) => l.progress.filter((p) => p.studentId === student.id && p.checkTotal > 0).map((p) => ({ score: p.checkCorrect, max: p.checkTotal }))),
        ];
        const pct = pooledPct(parts);
        if (pct != null) mastery[code] = { pct, level: masteryLevel(pct)! };
      }
      return {
        id: student.id, name: student.name, avgPct, lessonsDone, lessonsTotal: taught.length, missing,
        trend: trend(graded.map((g) => Math.round((g.score / g.max) * 100))),
        reasons: supportReasons({ avgPct, missing, activeReview: reviewCount.get(student.id) ?? 0, sharedLowMood: moodCount.get(student.id) ?? 0 }),
        mastery,
      };
    });

    const objectives: ObjectiveCol[] = codes.map((code) => {
      const cells = students.flatMap((st) => (st.mastery[code] ? [st.mastery[code]!] : []));
      return {
        code, title: cLessons.find((l) => l.outcomeCode === code)!.title,
        avgPct: cells.length ? Math.round(cells.reduce((a, x) => a + x.pct, 0) / cells.length) : null,
        secure: cells.filter((x) => x.level >= 2).length, withData: cells.length,
      };
    });
    const allGraded = cAssign.flatMap((a) => a.submissions.filter((x) => x.status === "GRADED" && x.maxScore).map((x) => ({ score: x.finalScore ?? 0, max: x.maxScore! })));
    return { id: c.id, name: c.name, subject: c.subject.name, gradeLevel: c.gradeLevel, students, objectives, avgPct: pooledPct(allGraded) };
  });
}

/** One student's progress, only through the teacher's own classes. 404 otherwise. */
export async function studentProgress(s: S, studentId: string) {
  const student = await db.user.findFirst({
    where: { id: studentId, schoolId: s.schoolId, role: "STUDENT", ...inMyClasses(s) },
    select: { id: true, name: true, gradeLevel: true, enrollments: { where: { class: { teacherId: s.userId } }, select: { classId: true } } },
  });
  if (!student) notFound();
  const classIds = student.enrollments.map((e) => e.classId);
  const [stats, results, recs, cognitive, shared] = await Promise.all([
    Promise.all(classIds.map((id) => classStats(s, id))).then((x) => x.flat()),
    db.submission.findMany({
      where: { studentId, status: { in: ["SUBMITTED", "GRADED"] }, assignment: { schoolId: s.schoolId, classId: { in: classIds } } },
      include: { assignment: { select: { id: true, title: true, dueAt: true, class: { select: { name: true } } } } },
      orderBy: { submittedAt: "desc" },
    }),
    db.recommendation.findMany({ where: { schoolId: s.schoolId, studentId }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.cognitiveSession.groupBy({ by: ["domain"], where: { schoolId: s.schoolId, studentId, completedAt: { not: null } }, _count: true }),
    db.selCheckin.findMany({ where: { schoolId: s.schoolId, studentId, shared: true }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  return { student, stats, results, recs, cognitive, shared };
}

// ---------------- Recommendations ----------------

export const REC_TABS: { key: string; status: RecommendationStatus; label: string }[] = [
  { key: "review", status: "PENDING_REVIEW", label: "Needs review" },
  { key: "active", status: "ACTIVE", label: "Active" },
  { key: "done", status: "DONE", label: "Done" },
  { key: "dismissed", status: "DISMISSED", label: "Dismissed" },
];

export async function teacherRecommendations(s: S, status: RecommendationStatus) {
  const where = { schoolId: s.schoolId, student: inMyClasses(s) };
  const [list, counts] = await Promise.all([
    db.recommendation.findMany({
      where: { ...where, status },
      include: { student: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.recommendation.groupBy({ by: ["status"], where, _count: true }),
  ]);
  const lessonIds = [...new Set(list.flatMap((r) => (r.lessonId ? [r.lessonId] : [])))];
  const lessons = await db.lesson.findMany({ where: { id: { in: lessonIds }, schoolId: s.schoolId }, select: { id: true, title: true } });
  return { list, counts: new Map(counts.map((c) => [c.status, c._count])), lessons: new Map(lessons.map((l) => [l.id, l.title])) };
}

/** Classes with their students and published lessons, for the manual recommendation form. */
export async function recFormOptions(s: S) {
  return db.class.findMany({
    where: { schoolId: s.schoolId, teacherId: s.userId },
    select: {
      id: true, name: true,
      enrollments: { select: { student: { select: { id: true, name: true } } }, orderBy: { student: { name: "asc" } } },
      lessons: { where: { status: "PUBLISHED" }, select: { id: true, title: true }, orderBy: { scheduledFor: "desc" } },
    },
    orderBy: { name: "asc" },
  });
}
