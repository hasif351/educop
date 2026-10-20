"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { award } from "@/lib/points";
import {
  MAX_DURATION_SEC, RECORDING_POINTS, addWatched, isComplete, readAnswers, readQuestions, readRanges, watchedPercent, type Range,
} from "@/lib/recordings";

const Id = z.string().min(1).max(40);

async function enrolled(id: string) {
  const s = await requireRole("STUDENT");
  const rec = await db.recording.findFirst({
    where: { id: Id.parse(id), schoolId: s.schoolId, status: "PUBLISHED", class: { schoolId: s.schoolId, enrollments: { some: { studentId: s.userId } } } },
    select: { id: true, title: true, durationSec: true, questions: true },
  });
  if (!rec) throw new Error("Recording not found");
  return { s, rec };
}

type Rec = Awaited<ReturnType<typeof enrolled>>["rec"];
type S = Awaited<ReturnType<typeof enrolled>>["s"];

/** Marks the view complete (once) and awards points when the rules are met. */
async function maybeComplete(s: S, rec: Rec, view: { watchedPct: number; answers: unknown; completedAt: Date | null }) {
  if (view.completedAt || !isComplete(view.watchedPct, readQuestions(rec.questions), readAnswers(view.answers))) return view.completedAt;
  const done = await db.recordingView.updateMany({ where: { recordingId: rec.id, studentId: s.userId, completedAt: null }, data: { completedAt: new Date() } });
  if (done.count) {
    await award(s.userId, s.schoolId, RECORDING_POINTS, `Watched “${rec.title}”`, `recording:${rec.id}`);
    await audit(s, "recording.complete", rec.id);
  }
  return new Date();
}

const Progress = z.object({
  positionSec: z.number().min(0).max(MAX_DURATION_SEC),
  durationSec: z.number().min(0).max(MAX_DURATION_SEC).nullable(),
  ranges: z.array(z.tuple([z.number().min(0).max(MAX_DURATION_SEC), z.number().min(0).max(MAX_DURATION_SEC)])).max(200),
});

/**
 * Called every ~10 s while playing and on pause, end and leaving the page.
 * Watched ranges are merged on the server; one save can add at most about
 * twice the time since the previous save, so the percent reflects real watching.
 */
export async function saveProgress(id: string, input: { positionSec: number; durationSec: number | null; ranges: Range[] }) {
  const { s, rec } = await enrolled(id);
  const v = Progress.safeParse(input);
  if (!v.success) return { error: "Bad progress data." };
  // The first student to load a recording without a known length fills it in.
  let duration = rec.durationSec;
  if (!duration && v.data.durationSec && v.data.durationSec >= 1) {
    duration = Math.round(v.data.durationSec);
    await db.recording.updateMany({ where: { id: rec.id, durationSec: null }, data: { durationSec: duration } });
  }
  const prev = await db.recordingView.findUnique({ where: { recordingId_studentId: { recordingId: rec.id, studentId: s.userId } } });
  const since = prev ? (Date.now() - prev.updatedAt.getTime()) / 1000 : 30;
  const watched = addWatched(readRanges(prev?.watched), v.data.ranges, duration, since * 2.1 + 5);
  const watchedPct = watchedPercent(watched, duration);
  const positionSec = Math.min(v.data.positionSec, duration ?? v.data.positionSec);
  const view = await db.recordingView.upsert({
    where: { recordingId_studentId: { recordingId: rec.id, studentId: s.userId } },
    create: { recordingId: rec.id, studentId: s.userId, positionSec, watched, watchedPct },
    update: { positionSec, watched, watchedPct },
  });
  const completedAt = await maybeComplete(s, rec, view);
  return { watchedPct, completed: !!completedAt };
}

/** Checks an in-video answer on the server; the answer key never reaches the browser first. */
export async function answerQuestion(id: string, questionId: string, choice: number) {
  const { s, rec } = await enrolled(id);
  const q = readQuestions(rec.questions).find((x) => x.id === z.string().max(24).parse(questionId));
  const c = z.number().int().min(0).safeParse(choice);
  if (!q || !c.success || c.data >= q.options.length) return { error: "That answer couldn't be saved." };
  const correct = c.data === q.answerIndex;
  const prev = await db.recordingView.findUnique({ where: { recordingId_studentId: { recordingId: rec.id, studentId: s.userId } } });
  const answers = readAnswers(prev?.answers);
  const before = answers[q.id];
  // Once right, it stays right; attempts count every try.
  answers[q.id] = { choice: c.data, correct: correct || !!before?.correct, attempts: (before?.attempts ?? 0) + 1 };
  const view = await db.recordingView.upsert({
    where: { recordingId_studentId: { recordingId: rec.id, studentId: s.userId } },
    create: { recordingId: rec.id, studentId: s.userId, answers, positionSec: q.t },
    update: { answers },
  });
  if (!before) await audit(s, "recording.answer", rec.id, { question: q.id, correct });
  const completedAt = await maybeComplete(s, rec, view);
  return { correct, explanation: q.explanation, answerIndex: correct ? q.answerIndex : null, completed: !!completedAt };
}
