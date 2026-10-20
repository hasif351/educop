import "server-only";
import { db } from "./db";
import { dropOff, forStudent, questionStats, readAnswers, readChapters, readQuestions, readRanges } from "./recordings";
import type { SessionPayload } from "./session";

// Recorded classes data access. A teacher sees recordings for classes they
// teach; a student sees PUBLISHED recordings for classes they're enrolled in.
// Both scoped to their school, so another school's id returns null (404).

type S = SessionPayload & { schoolId: string };

const teaches = (s: S) => ({ schoolId: s.schoolId, class: { schoolId: s.schoolId, teacherId: s.userId } });
const enrolled = (s: S) => ({ schoolId: s.schoolId, status: "PUBLISHED" as const, class: { schoolId: s.schoolId, enrollments: { some: { studentId: s.userId } } } });

export async function teacherRecordings(s: S) {
  const recs = await db.recording.findMany({
    where: teaches(s),
    include: { class: { select: { name: true, _count: { select: { enrollments: true } } } }, views: { select: { watchedPct: true, completedAt: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return recs.map(({ views, ...r }) => ({
    ...r,
    viewCount: views.filter((v) => v.watchedPct > 0).length,
    avgPct: views.length ? Math.round(views.reduce((t, v) => t + v.watchedPct, 0) / views.length) : null,
    completed: views.filter((v) => v.completedAt).length,
  }));
}

/** The recording if the caller teaches its class, else null. */
export async function teacherRecording(s: S, id: string) {
  const r = await db.recording.findFirst({
    where: { id, ...teaches(s) },
    include: { class: { select: { id: true, name: true } }, lesson: { select: { id: true, title: true } }, liveSession: { select: { id: true, title: true } } },
  });
  return r && { ...r, chapterList: readChapters(r.chapters), questionList: readQuestions(r.questions) };
}

/** Per-student results, per-question results and the aggregate drop-off line. */
export async function recordingAnalytics(rec: { id: string; classId: string; durationSec: number | null; questions: unknown }) {
  const [roster, views] = await Promise.all([
    db.enrollment.findMany({ where: { classId: rec.classId }, select: { student: { select: { id: true, name: true } } }, orderBy: { student: { name: "asc" } } }),
    db.recordingView.findMany({ where: { recordingId: rec.id } }),
  ]);
  const questions = readQuestions(rec.questions);
  const byStudent = new Map(views.map((v) => [v.studentId, v]));
  const students = roster.map(({ student }) => {
    const v = byStudent.get(student.id);
    return { id: student.id, name: student.name, watchedPct: v?.watchedPct ?? 0, started: !!v && v.watchedPct > 0, completedAt: v?.completedAt ?? null, answers: readAnswers(v?.answers), updatedAt: v?.updatedAt ?? null };
  });
  const rosterViews = views.filter((v) => roster.some((r) => r.student.id === v.studentId) && v.watchedPct > 0);
  return {
    students,
    questions: questions.map((q, i) => ({ ...q, ...questionStats([q], rosterViews.map((v) => readAnswers(v.answers)))[0], n: i + 1 })),
    dropOff: dropOff(rosterViews.map((v) => readRanges(v.watched)), rec.durationSec),
    viewers: rosterViews.length,
  };
}

export async function studentRecordings(s: S) {
  return db.recording.findMany({
    where: enrolled(s),
    select: {
      id: true, title: true, description: true, durationSec: true, publishedAt: true,
      class: { select: { name: true } }, teacher: { select: { name: true } },
      views: { where: { studentId: s.userId }, select: { watchedPct: true, completedAt: true, positionSec: true } },
    },
    orderBy: { publishedAt: "desc" },
  });
}

/** A published recording for an enrolled student, with their saved progress. Answer keys stay on the server. */
export async function studentRecording(s: S, id: string) {
  const r = await db.recording.findFirst({
    where: { id, ...enrolled(s) },
    include: { class: { select: { name: true } }, teacher: { select: { name: true } }, lesson: { select: { id: true, title: true, status: true } } },
  });
  if (!r) return null;
  const view = await db.recordingView.findUnique({ where: { recordingId_studentId: { recordingId: r.id, studentId: s.userId } } });
  const answers = readAnswers(view?.answers);
  return {
    ...r,
    chapterList: readChapters(r.chapters),
    questionList: forStudent(readQuestions(r.questions)),
    progress: {
      positionSec: view?.positionSec ?? 0,
      watched: readRanges(view?.watched),
      watchedPct: view?.watchedPct ?? 0,
      completedAt: view?.completedAt?.toISOString() ?? null,
      answers: Object.fromEntries(Object.entries(answers).map(([k, a]) => [k, { choice: a.choice, correct: a.correct }])),
    },
  };
}

/** Classes (with lessons) the teacher can attach a recording to. */
export async function recordingFormClasses(s: S) {
  return db.class.findMany({
    where: { schoolId: s.schoolId, teacherId: s.userId },
    select: { id: true, name: true, lessons: { select: { id: true, title: true }, orderBy: { scheduledFor: "desc" } } },
    orderBy: { name: "asc" },
  });
}

/** For the parent overview: how many of the class recordings the child has watched and completed. */
export async function childRecordingSummary(schoolId: string, childId: string, classIds: string[]) {
  const [published, views] = await Promise.all([
    db.recording.count({ where: { schoolId, status: "PUBLISHED", classId: { in: classIds } } }),
    db.recordingView.findMany({ where: { studentId: childId, recording: { schoolId, status: "PUBLISHED", classId: { in: classIds } } }, select: { watchedPct: true, completedAt: true } }),
  ]);
  return { published, watched: views.filter((v) => v.watchedPct > 0).length, completed: views.filter((v) => v.completedAt).length };
}
