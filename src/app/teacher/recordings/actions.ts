"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { del } from "@vercel/blob";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { teacherRecording } from "@/lib/data-recordings";
import { MAX_DURATION_SEC, QuestionSchema, isBlobUrl, newQuestionId, parseTimestamp, parseVideoUrl, toVtt } from "@/lib/recordings";

export type RecordingFormState = { error?: string };

type S = Awaited<ReturnType<typeof requireRole>>;
const Id = z.string().min(1).max(40);

const Input = z.object({
  classId: z.string().min(1, "Choose a class.").max(40),
  lessonId: z.string().max(40).default(""),
  liveSessionId: z.string().max(40).default(""),
  title: z.string().trim().min(3, "Give the recording a title.").max(160),
  description: z.string().trim().max(2000, "Keep the description under 2,000 characters.").default(""),
  videoUrl: z.string().max(2000).default(""),
  durationSec: z.string().max(12).default(""),
  captions: z.string().max(100_000, "Captions are too long (100,000 characters at most).").default(""),
  chapters: z.string().max(20_000).default("[]"),
  questions: z.string().max(50_000).default("[]"),
  intent: z.enum(["draft", "publish"]),
});

// The editors send times as typed ("1:23"); they're parsed here so errors can name the row.
const ChapterRows = z.array(z.object({ time: z.string().max(12), title: z.string().trim().max(120) })).max(50, "Up to 50 chapters.");
const QuestionRows = z.array(z.object({
  id: z.string().max(24).default(""), time: z.string().max(12), prompt: z.string().max(500), options: z.array(z.string().max(200)).max(6),
  answerIndex: z.number().int(), explanation: z.string().max(500).default(""),
})).max(20, "Up to 20 questions.");

function parseEditors(chaptersRaw: string, questionsRaw: string, duration: number | null) {
  let cRows, qRows;
  try { cRows = ChapterRows.parse(JSON.parse(chaptersRaw)); qRows = QuestionRows.parse(JSON.parse(questionsRaw)); }
  catch { return { error: "Check the chapters and questions." }; }
  const inVideo = (t: number) => duration == null || t < duration;
  const chapters = [];
  for (const [i, c] of cRows.entries()) {
    if (!c.time.trim() && !c.title) continue;
    const t = parseTimestamp(c.time);
    if (t == null || !inVideo(t)) return { error: `Chapter ${i + 1}: give a time inside the video, like 1:30.` };
    if (!c.title) return { error: `Chapter ${i + 1}: add a title.` };
    chapters.push({ t, title: c.title });
  }
  const questions = [];
  for (const [i, q] of qRows.entries()) {
    const t = parseTimestamp(q.time);
    if (t == null || !inVideo(t)) return { error: `Question ${i + 1}: give a time inside the video, like 1:30.` };
    const parsed = QuestionSchema.safeParse({ ...q, id: /^[a-z0-9]{4,24}$/i.test(q.id) ? q.id : newQuestionId(), t, options: q.options.map((o) => o.trim()).filter(Boolean) });
    if (!parsed.success) return { error: `Question ${i + 1}: write the question, at least two options and pick the correct one.` };
    questions.push(parsed.data);
  }
  if (new Set(questions.map((q) => q.id)).size !== questions.length) return { error: "Two questions have the same id. Remove one and add it again." };
  return { chapters: chapters.sort((a, b) => a.t - b.t), questions: questions.sort((a, b) => a.t - b.t) };
}

async function notifyPublished(s: S, r: { id: string; classId: string; title: string }) {
  const [cls, students] = await Promise.all([
    db.class.findFirstOrThrow({ where: { id: r.classId, schoolId: s.schoolId }, select: { name: true } }),
    db.enrollment.findMany({ where: { classId: r.classId, class: { schoolId: s.schoolId } }, select: { studentId: true } }),
  ]);
  await notify(students.map((e) => e.studentId), { schoolId: s.schoolId, kind: "class", title: `New recorded class: ${r.title}`, body: `${cls.name} · ${s.name}`, href: `/student/recordings/${r.id}` });
}

export async function saveRecording(recordingId: string | null, _: RecordingFormState, form: FormData): Promise<RecordingFormState> {
  const s = await requireRole("TEACHER");
  const parsed = Input.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const existing = recordingId ? await teacherRecording(s, Id.parse(recordingId)) : null;
  if (recordingId && !existing) return { error: "Recording not found." };

  const cls = await db.class.findFirst({ where: { id: v.classId, schoolId: s.schoolId, teacherId: s.userId }, select: { id: true } });
  if (!cls) return { error: "You can only add recordings to classes you teach." };
  const lesson = v.lessonId ? await db.lesson.findFirst({ where: { id: v.lessonId, schoolId: s.schoolId, classId: cls.id }, select: { id: true } }) : null;
  if (v.lessonId && !lesson) return { error: "Choose a lesson from the same class." };
  const live = v.liveSessionId ? await db.liveSession.findFirst({ where: { id: v.liveSessionId, schoolId: s.schoolId, teacherId: s.userId, classId: cls.id }, select: { id: true } }) : null;

  const video = parseVideoUrl(v.videoUrl);
  if ("error" in video) return { error: video.error };
  const d = Number(v.durationSec);
  const durationSec = v.durationSec && Number.isFinite(d) && d > 0 && d <= MAX_DURATION_SEC ? Math.round(d) : existing?.durationSec ?? null;
  const caps = toVtt(v.captions);
  if ("error" in caps) return { error: caps.error };
  const editors = parseEditors(v.chapters, v.questions, durationSec);
  if ("error" in editors) return { error: editors.error };

  const publish = v.intent === "publish";
  const data = {
    classId: cls.id, lessonId: lesson?.id ?? null, liveSessionId: live?.id ?? existing?.liveSessionId ?? null,
    title: v.title, description: v.description, videoUrl: video.url, source: video.source, durationSec,
    captionsVtt: caps.vtt, chapters: editors.chapters, questions: editors.questions,
    status: publish ? ("PUBLISHED" as const) : ("DRAFT" as const),
    publishedAt: publish ? existing?.publishedAt ?? new Date() : null,
  };
  const rec = existing
    ? await db.recording.update({ where: { id: existing.id }, data })
    : await db.recording.create({ data: { ...data, schoolId: s.schoolId, teacherId: s.userId } });
  await audit(s, existing ? "recording.update" : "recording.create", rec.id, { status: rec.status, source: rec.source });
  if (publish && existing?.status !== "PUBLISHED") await notifyPublished(s, rec);
  revalidatePath("/teacher/recordings");
  redirect(`/teacher/recordings/${rec.id}`);
}

export async function setRecordingStatus(id: string, status: "PUBLISHED" | "DRAFT") {
  const s = await requireRole("TEACHER");
  const rec = await teacherRecording(s, Id.parse(id));
  const next = z.enum(["PUBLISHED", "DRAFT"]).parse(status);
  if (!rec || rec.status === next) return;
  await db.recording.update({ where: { id: rec.id }, data: { status: next, publishedAt: next === "PUBLISHED" ? rec.publishedAt ?? new Date() : null } });
  await audit(s, next === "PUBLISHED" ? "recording.publish" : "recording.unpublish", rec.id);
  if (next === "PUBLISHED") await notifyPublished(s, rec);
  revalidatePath("/teacher/recordings");
  revalidatePath(`/teacher/recordings/${rec.id}`);
}

/** Drafts only, so students never lose a recording they've started. */
export async function deleteRecording(id: string) {
  const s = await requireRole("TEACHER");
  const rec = await teacherRecording(s, Id.parse(id));
  if (!rec || rec.status === "PUBLISHED") return;
  await db.recording.delete({ where: { id: rec.id } });
  // Uploaded files are removed from storage too, unless another recording uses them.
  if (rec.source === "upload" && isBlobUrl(rec.videoUrl) && process.env.BLOB_READ_WRITE_TOKEN
    && (await db.recording.count({ where: { videoUrl: rec.videoUrl } })) === 0) {
    await del(rec.videoUrl).catch(() => undefined);
  }
  await audit(s, "recording.delete", rec.id, { title: rec.title });
  revalidatePath("/teacher/recordings");
  redirect("/teacher/recordings");
}
