import { readFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { RECORDING_POINTS, mergeRanges, watchedPercent, type Range } from "../../src/lib/recordings";

// Demo data for recorded classes. Idempotent: it also runs against a database
// that was seeded before this module existed (see seed/modules.ts). Finds people
// by demo email. The video and captions are a short fictional lesson made for
// the demo (public/media/equivalent-fractions.*).

const DAY = 86_400_000;
const VIDEO = "/media/equivalent-fractions.mp4";
const DURATION = 72;
const TITLE = "Equivalent fractions (recorded lesson)";

export async function seedRecordings(db: PrismaClient) {
  const sara = await db.user.findUnique({ where: { email: "sara.mitchell@crescentbay.example" } });
  if (!sara?.schoolId) return;
  const cls = await db.class.findFirst({ where: { schoolId: sara.schoolId, teacherId: sara.id, name: "5B Mathematics" } });
  if (!cls || (await db.recording.count({ where: { classId: cls.id, title: TITLE } })) > 0) return;
  const lesson = await db.lesson.findFirst({ where: { classId: cls.id, title: "Equivalent fractions" } });
  const captions = readFileSync(path.join(__dirname, "../../public/media/equivalent-fractions.vtt"), "utf8");

  const rec = await db.recording.create({
    data: {
      schoolId: sara.schoolId, classId: cls.id, teacherId: sara.id, lessonId: lesson?.id ?? null,
      title: TITLE, description: "A short recap of today's lesson. Watch it before you try the worksheet.",
      videoUrl: VIDEO, source: "demo", durationSec: DURATION, captionsVtt: captions,
      chapters: [
        { t: 0, title: "Introduction" }, { t: 10, title: "Same amount, different pieces" }, { t: 24, title: "1/2 = 2/4 = 4/8" },
        { t: 38, title: "The rule" }, { t: 52, title: "Check your understanding" }, { t: 64, title: "Wrap-up" },
      ],
      questions: [
        { id: "qhalf01", t: 37, prompt: "Which fraction is equal to 1/2?", options: ["2/3", "4/8", "1/4"], answerIndex: 1, explanation: "4 is half of 8, so 4/8 = 1/2." },
        { id: "qcheck02", t: 63, prompt: "Is 3/6 equal to 1/2?", options: ["Yes", "No"], answerIndex: 0, explanation: "3 × 2 = 6, so 3/6 is the same amount as 1/2." },
      ],
      status: "PUBLISHED", publishedAt: new Date(Date.now() - DAY),
    },
  });

  // Partial views for a few students (finding them by email keeps this independent of seed order).
  type V = { email: string; watched: Range[]; position: number; answers?: Record<string, { choice: number; correct: boolean; attempts: number }>; complete?: boolean };
  const views: V[] = [
    { email: "layla@crescentbay.example", watched: [[0, 29]], position: 29 },
    { email: "ethan@crescentbay.example", watched: [[0, 72]], position: 72, complete: true,
      answers: { qhalf01: { choice: 1, correct: true, attempts: 1 }, qcheck02: { choice: 0, correct: true, attempts: 1 } } },
    { email: "aisha@crescentbay.example", watched: [[0, 47]], position: 47, answers: { qhalf01: { choice: 1, correct: true, attempts: 2 } } },
    { email: "noah@crescentbay.example", watched: [[0, 11]], position: 11 },
  ];
  for (const v of views) {
    const student = await db.user.findUnique({ where: { email: v.email } });
    if (!student) continue;
    const watched = mergeRanges(v.watched, DURATION);
    await db.recordingView.create({
      data: {
        recordingId: rec.id, studentId: student.id, positionSec: v.position, watched, watchedPct: watchedPercent(watched, DURATION),
        answers: v.answers ?? {}, completedAt: v.complete ? new Date(Date.now() - DAY / 2) : null,
      },
    });
    if (v.complete) {
      const made = await db.pointEvent.createMany({ data: [{ studentId: student.id, schoolId: sara.schoolId, points: RECORDING_POINTS, reason: `Watched “${TITLE}”`, key: `recording:${rec.id}` }], skipDuplicates: true });
      if (made.count) await db.user.update({ where: { id: student.id }, data: { points: { increment: RECORDING_POINTS } } });
    }
  }
}
