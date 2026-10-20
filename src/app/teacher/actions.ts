"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { finalizeScore } from "@/lib/submit";
import { notify, parentsOf } from "@/lib/notify";

type S = Awaited<ReturnType<typeof requireRole>>;
export type FormState = { error?: string; ok?: boolean };

async function ownClass(s: S, classId: string) {
  const c = await db.class.findFirst({ where: { id: classId, schoolId: s.schoolId, teacherId: s.userId }, select: { id: true } });
  if (!c) throw new Error("Class not found");
  return c;
}

/** In-app notifications for a class's students (and, optionally, their verified parents). */
async function notifyClass(s: S, classId: string, withParents: boolean, n: { kind: "class" | "assign"; title: string; body: string; studentHref: string; parentHref?: string }) {
  const students = (await db.enrollment.findMany({ where: { classId, class: { schoolId: s.schoolId } }, select: { studentId: true } })).map((e) => e.studentId);
  await notify(students, { schoolId: s.schoolId, kind: n.kind, title: n.title, body: n.body, href: n.studentHref });
  if (withParents) await notify(await parentsOf(students), { schoolId: s.schoolId, kind: n.kind, title: n.title, body: n.body, href: n.parentHref ?? "/parent" });
}

async function notifyLessonPublished(s: S, lesson: { id: string; classId: string; title: string }) {
  const cls = await db.class.findUniqueOrThrow({ where: { id: lesson.classId }, select: { name: true } });
  await notifyClass(s, lesson.classId, false, { kind: "class", title: `New lesson: ${lesson.title}`, body: `${cls.name} · ${s.name}`, studentHref: `/student/lessons/${lesson.id}` });
}

async function notifyAssignmentPublished(s: S, a: { id: string; classId: string; title: string; dueAt: Date }) {
  const cls = await db.class.findUniqueOrThrow({ where: { id: a.classId }, select: { name: true } });
  const due = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(a.dueAt);
  await notifyClass(s, a.classId, true, { kind: "assign", title: `New assignment: ${a.title}`, body: `${cls.name} · due ${due}`, studentHref: `/student/assignments/${a.id}` });
}

// ---------------- Lessons ----------------

const KC = z.array(z.object({
  prompt: z.string().trim().min(1).max(500),
  options: z.array(z.string().trim().min(1).max(200)).min(2).max(6),
  answerIndex: z.number().int().min(0),
  hint: z.string().max(300).optional().default(""),
  explanation: z.string().max(500).optional().default(""),
}).refine((q) => q.answerIndex < q.options.length, "Each question needs a correct answer")).max(10);

const LessonInput = z.object({
  classId: z.string().min(1, "Choose a class."),
  title: z.string().trim().min(3, "Give the lesson a title.").max(160),
  outcomeCode: z.string().trim().max(60).optional(),
  scheduledFor: z.string().min(1, "Pick a date and time."),
  durationMin: z.coerce.number().int().min(5).max(240),
  objectives: z.string().trim().min(1, "Add at least one objective."),
  introduction: z.string().trim().max(5000),
  explanation: z.string().trim().max(10000),
  activity: z.string().trim().max(5000),
  knowledgeCheck: z.string(),
  worksheet: z.string().trim().max(5000),
  nextActivity: z.string().trim().max(2000),
  intent: z.enum(["draft", "publish"]),
});

/** datetime-local values are entered in school time (GST, UTC+4). */
function fromLocal(v: string) {
  const d = new Date(`${v}:00+04:00`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  return d;
}

export async function saveLesson(lessonId: string | null, _: FormState, form: FormData): Promise<FormState> {
  const s = await requireRole("TEACHER");
  const parsed = LessonInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  let kc;
  try { kc = KC.parse(JSON.parse(v.knowledgeCheck || "[]")); } catch { return { error: "Check the knowledge-check questions: each needs a prompt, 2+ options and a correct answer." }; }
  try { await ownClass(s, v.classId); } catch { return { error: "You can only add lessons to your own classes." }; }

  if (lessonId) {
    const existing = await db.lesson.findFirst({ where: { id: lessonId, schoolId: s.schoolId, class: { teacherId: s.userId } } });
    if (!existing) return { error: "Lesson not found." };
  }
  const data = {
    classId: v.classId, title: v.title, outcomeCode: v.outcomeCode || null, scheduledFor: fromLocal(v.scheduledFor), durationMin: v.durationMin,
    objectives: v.objectives.split("\n").map((x) => x.trim()).filter(Boolean),
    introduction: v.introduction, explanation: v.explanation, activity: v.activity, knowledgeCheck: kc,
    worksheet: v.worksheet, nextActivity: v.nextActivity,
    ...(v.intent === "publish" ? await publishState(s.schoolId) : {}),
  };
  const wasPublished = lessonId ? (await db.lesson.findUnique({ where: { id: lessonId }, select: { status: true } }))?.status === "PUBLISHED" : false;
  const lesson = lessonId
    ? await db.lesson.update({ where: { id: lessonId }, data })
    : await db.lesson.create({ data: { ...data, schoolId: s.schoolId, authorId: s.userId } });
  if (lesson.status === "PUBLISHED" && !wasPublished) await notifyLessonPublished(s, lesson);
  await audit(s, lessonId ? "lesson.update" : "lesson.create", lesson.id, { intent: v.intent });
  revalidatePath("/teacher/lessons");
  redirect(`/teacher/lessons?saved=${lesson.id}`);
}

/** Publishing goes straight live, or to the school admin first when the school requires approval. */
async function publishState(schoolId: string) {
  const school = await db.school.findUniqueOrThrow({ where: { id: schoolId }, select: { requireLessonApproval: true } });
  return school.requireLessonApproval
    ? { status: "PENDING_APPROVAL" as const }
    : { status: "PUBLISHED" as const, publishedAt: new Date() };
}

export async function setLessonStatus(lessonId: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
  const s = await requireRole("TEACHER");
  const l = await db.lesson.findFirst({ where: { id: lessonId, schoolId: s.schoolId, class: { teacherId: s.userId } } });
  if (!l) throw new Error("Lesson not found");
  const next = status === "PUBLISHED" ? await publishState(s.schoolId) : { status };
  await db.lesson.update({ where: { id: l.id }, data: next });
  if (next.status === "PUBLISHED" && l.status !== "PUBLISHED") await notifyLessonPublished(s, l);
  await audit(s, `lesson.${status.toLowerCase()}`, l.id);
  revalidatePath("/teacher/lessons");
}

// ---------------- Assignments ----------------

const QuestionInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MCQ"), prompt: z.string().trim().min(1, "Every question needs a prompt.").max(1000), options: z.array(z.string().trim().min(1, "Options can't be empty.").max(300)).min(2, "Multiple-choice questions need at least 2 options.").max(6), answerIndex: z.number().int().min(0), points: z.number().int().min(1).max(100) }),
  z.object({ type: z.literal("SHORT"), prompt: z.string().trim().min(1, "Every question needs a prompt.").max(1000), points: z.number().int().min(1).max(100) }),
]);
const QuestionList = z.array(QuestionInput).min(1, "Add at least one question.").max(50)
  .refine((qs) => qs.every((q) => q.type !== "MCQ" || q.answerIndex < q.options.length), "Pick the correct option for every multiple-choice question.");

const AssignmentInput = z.object({
  classId: z.string().min(1, "Choose a class."),
  lessonId: z.string().optional(),
  title: z.string().trim().min(3, "Give the assignment a title.").max(160),
  instructions: z.string().trim().max(5000).default(""),
  dueAt: z.string().min(1, "Pick a due date."),
  latePolicy: z.enum(["penalty", "nopenalty", "none"]),
  latePenaltyPerDay: z.coerce.number().int().min(1).max(100).default(10),
  maxLateDays: z.coerce.number().int().min(1).max(30).default(3),
  questions: z.string(),
  intent: z.enum(["draft", "publish"]),
});

export async function saveAssignment(assignmentId: string | null, _: FormState, form: FormData): Promise<FormState> {
  const s = await requireRole("TEACHER");
  const parsed = AssignmentInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  let qs: z.infer<typeof QuestionInput>[];
  try {
    const raw = JSON.parse(v.questions);
    const r = QuestionList.safeParse(raw);
    if (!r.success) return { error: r.error.issues[0].message };
    qs = r.data;
  } catch { return { error: "Couldn't read the questions. Reload and try again." }; }
  try { await ownClass(s, v.classId); } catch { return { error: "You can only set work for your own classes." }; }
  if (v.lessonId) {
    const l = await db.lesson.findFirst({ where: { id: v.lessonId, classId: v.classId, schoolId: s.schoolId } });
    if (!l) return { error: "The linked lesson must belong to the same class." };
  }
  if (assignmentId) {
    const existing = await db.assignment.findFirst({ where: { id: assignmentId, schoolId: s.schoolId, class: { teacherId: s.userId } } });
    if (!existing) return { error: "Assignment not found." };
    if (existing.status !== "DRAFT") return { error: "Published assignments can't be edited. Unpublish isn't available once students have answered." };
  }

  const data = {
    classId: v.classId, lessonId: v.lessonId || null, title: v.title, instructions: v.instructions, dueAt: fromLocal(v.dueAt),
    latePenaltyPerDay: v.latePolicy === "none" ? null : v.latePolicy === "nopenalty" ? 0 : v.latePenaltyPerDay,
    maxLateDays: v.maxLateDays,
    status: v.intent === "publish" ? ("PUBLISHED" as const) : ("DRAFT" as const),
    publishedAt: v.intent === "publish" ? new Date() : null,
  };
  const questionRows = qs.map((q, i) => ({ order: i, type: q.type, prompt: q.prompt, options: q.type === "MCQ" ? q.options : [], answerIndex: q.type === "MCQ" ? q.answerIndex : null, points: q.points }));

  const a = await db.$transaction(async (tx) => {
    if (assignmentId) {
      await tx.question.deleteMany({ where: { assignmentId } });
      return tx.assignment.update({ where: { id: assignmentId }, data: { ...data, questions: { create: questionRows } } });
    }
    return tx.assignment.create({ data: { ...data, schoolId: s.schoolId, authorId: s.userId, questions: { create: questionRows } } });
  });
  if (a.status === "PUBLISHED") await notifyAssignmentPublished(s, a);
  await audit(s, assignmentId ? "assignment.update" : "assignment.create", a.id, { intent: v.intent });
  revalidatePath("/teacher/assignments");
  redirect(`/teacher/assignments/${a.id}`);
}

export async function publishAssignment(assignmentId: string) {
  const s = await requireRole("TEACHER");
  const a = await db.assignment.findFirst({ where: { id: assignmentId, schoolId: s.schoolId, class: { teacherId: s.userId }, status: "DRAFT" } });
  if (!a) throw new Error("Assignment not found");
  await db.assignment.update({ where: { id: a.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  await notifyAssignmentPublished(s, a);
  await audit(s, "assignment.publish", a.id);
  revalidatePath(`/teacher/assignments/${a.id}`);
}

const Grade = z.object({ feedback: z.string().trim().max(3000).default("") });

export async function gradeSubmission(assignmentId: string, submissionId: string, _: FormState, form: FormData): Promise<FormState> {
  const s = await requireRole("TEACHER");
  const sub = await db.submission.findFirst({
    where: { id: submissionId, assignmentId, status: { in: ["SUBMITTED", "GRADED"] }, assignment: { schoolId: s.schoolId, class: { teacherId: s.userId } } },
    include: { answers: { include: { question: true } } },
  });
  if (!sub) return { error: "Submission not found." };
  const { feedback } = Grade.parse(Object.fromEntries(form));

  const updates = [];
  for (const ans of sub.answers.filter((x) => x.question.type === "SHORT")) {
    const raw = form.get(`score_${ans.questionId}`);
    if (raw === null || raw === "") return { error: "Give a score for every short answer." };
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > ans.question.points) return { error: `Scores must be between 0 and ${ans.question.points}.` };
    updates.push(db.answer.update({ where: { id: ans.id }, data: { teacherScore: n } }));
  }
  await db.$transaction([...updates, db.submission.update({ where: { id: sub.id }, data: { feedback: feedback || null } })]);
  const result = await finalizeScore(sub.id);
  if (result.fullyGraded) {
    const [a, student] = await Promise.all([
      db.assignment.findUniqueOrThrow({ where: { id: assignmentId }, select: { title: true } }),
      db.user.findUniqueOrThrow({ where: { id: sub.studentId }, select: { name: true } }),
    ]);
    const n = { schoolId: s.schoolId, kind: "grade" as const, title: `Feedback posted: ${a.title}`, body: `Scored ${result.final}/${result.max}${feedback ? " with comments" : ""}` };
    await notify([sub.studentId], { ...n, href: `/student/assignments/${assignmentId}` });
    await notify(await parentsOf([sub.studentId]), { ...n, body: `${student.name} · ${n.body}`, href: "/parent" });
  }
  await audit(s, "submission.grade", sub.id);
  revalidatePath(`/teacher/assignments/${assignmentId}`);
  redirect(`/teacher/assignments/${assignmentId}?graded=${sub.id}`);
}

// ---------------- Recommendations ----------------

export async function reviewRecommendation(id: string, decision: "approve" | "dismiss") {
  const s = await requireRole("TEACHER");
  const rec = await db.recommendation.findFirst({
    where: { id, schoolId: s.schoolId, status: "PENDING_REVIEW", student: { enrollments: { some: { class: { teacherId: s.userId } } } } },
  });
  if (!rec) throw new Error("Recommendation not found");
  await db.recommendation.update({ where: { id }, data: { status: decision === "approve" ? "ACTIVE" : "DISMISSED" } });
  await audit(s, `recommendation.${decision}`, id);
  revalidatePath("/teacher");
}
