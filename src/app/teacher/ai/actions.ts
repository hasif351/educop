"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { generate } from "@/lib/ai";
import { dayBounds } from "@/lib/data";
import {
  buildPrompt, lessonFields, parseDraft, quizQuestionRows, templateDraft, ToolInput, validateDraft,
  type AiTool, type DraftContent, type PromptContext, type StoredDraft, type SubmissionContext,
} from "@/lib/ai-teacher";

type S = Awaited<ReturnType<typeof requireRole>>;
export type FormState = { error?: string; ok?: boolean; message?: string };

// Keeps model costs predictable; template drafts count too, which is fine.
const HOURLY_LIMIT = 30;

/** A submission in one of this teacher's classes, with what the feedback prompt needs. */
function ownSubmission(s: S, id: string) {
  return db.submission.findFirst({
    where: { id, status: { in: ["SUBMITTED", "GRADED"] }, assignment: { schoolId: s.schoolId, class: { teacherId: s.userId } } },
    include: {
      student: { select: { name: true } },
      answers: true,
      assignment: { select: { id: true, title: true, classId: true, class: { select: { gradeLevel: true } }, questions: { orderBy: { order: "asc" } } } },
    },
  });
}

export async function generateDraft(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireRole("TEACHER");
  const raw = Object.fromEntries(form) as Record<string, string>;

  // Feedback is about one submission: its class, topic and grade come from there.
  let submission: SubmissionContext | undefined;
  if (raw.tool === "feedback") {
    const sub = raw.submissionId ? await ownSubmission(s, raw.submissionId) : null;
    if (!sub) return { error: "Choose a submission from one of your classes." };
    const byQ = new Map(sub.answers.map((a) => [a.questionId, a]));
    submission = {
      assignmentTitle: sub.assignment.title,
      studentFirstName: sub.student.name.split(" ")[0],
      items: sub.assignment.questions.map((q) => {
        const a = byQ.get(q.id);
        return {
          prompt: q.prompt, type: q.type, points: q.points,
          answer: q.type === "MCQ" ? (a?.choiceIndex != null ? q.options[a.choiceIndex] ?? "" : "") : a?.text ?? "",
          score: q.type === "MCQ" ? a?.autoScore ?? 0 : a?.teacherScore ?? null,
          correctAnswer: q.type === "MCQ" && q.answerIndex != null ? q.options[q.answerIndex] : undefined,
        };
      }),
    };
    Object.assign(raw, { classId: sub.assignment.classId, topic: sub.assignment.title, grade: String(sub.assignment.class.gradeLevel) });
  }

  const parsed = ToolInput.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;
  const cls = await db.class.findFirst({ where: { id: input.classId, schoolId: s.schoolId, teacherId: s.userId }, include: { subject: true, school: { select: { aiEnabled: true } } } });
  if (!cls) return { error: "Choose one of your own classes." };
  const recent = await db.aiDraft.count({ where: { teacherId: s.userId, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= HOURLY_LIMIT) return { error: `You've made ${HOURLY_LIMIT} drafts in the last hour. Please edit an existing one or try again later.` };

  const ctx: PromptContext = {
    className: cls.name, subject: cls.subject.name, grade: input.grade, topic: input.topic,
    outcomeCode: input.outcomeCode, notes: input.notes, questionCount: input.questionCount, submission,
  };
  const prompt = buildPrompt(input.tool, ctx);
  let content: unknown = null;
  let usage = { model: null as string | null, inputTokens: 0, outputTokens: 0 };
  if (cls.school.aiEnabled) {
    const r = await generate({ system: prompt.system, messages: [{ role: "user", content: prompt.user }], maxTokens: 4000 });
    usage = { model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens };
    if (!r.offline && !r.refused) {
      const p = parseDraft(input.tool, r.text);
      if (p.ok) content = p.data;
      else console.error(`AI ${input.tool} draft failed validation: ${p.error}`);
    }
  }
  const source = content ? "ai" : "template";
  content ??= templateDraft(input.tool, ctx);

  const output: StoredDraft = { input, content, source };
  const draft = await db.aiDraft.create({
    data: { schoolId: s.schoolId, teacherId: s.userId, tool: input.tool, prompt: prompt.user, output: output as object, ...usage },
  });
  await audit(s, "ai_draft.create", draft.id, { tool: input.tool, source });
  revalidatePath("/teacher/ai");
  redirect(`/teacher/ai/${draft.id}`);
}

const DraftForm = z.object({ content: z.string().max(100_000), intent: z.enum(["save", "accept", "discard"]) });

/** School-time date: `days` from today at `hour` GST. */
function schoolTime(days: number, hour: number) {
  return new Date(dayBounds(days).start.getTime() + hour * 3600_000);
}

export async function updateDraft(id: string, _: FormState, form: FormData): Promise<FormState> {
  const s = await requireRole("TEACHER");
  const f = DraftForm.safeParse(Object.fromEntries(form));
  if (!f.success) return { error: "Couldn't read the draft. Reload and try again." };
  const draft = await db.aiDraft.findFirst({ where: { id, schoolId: s.schoolId, teacherId: s.userId, status: "DRAFT" } });
  if (!draft) return { error: "This draft can no longer be changed." };
  const stored = draft.output as unknown as StoredDraft;
  const tool = draft.tool as AiTool;

  if (f.data.intent === "discard") {
    await db.aiDraft.update({ where: { id }, data: { status: "DISCARDED" } });
    await audit(s, "ai_draft.discard", id);
    revalidatePath("/teacher/ai");
    redirect("/teacher/ai");
  }

  let json: unknown;
  try { json = JSON.parse(f.data.content); } catch { return { error: "Couldn't read the draft. Reload and try again." }; }
  const v = validateDraft(tool, json);
  if (!v.ok) return { error: `Check the draft. ${v.error}` };
  const save = (extra: Partial<StoredDraft> = {}, status = "DRAFT") =>
    db.aiDraft.update({ where: { id }, data: { status, output: { ...stored, content: v.data, ...extra } as object } });

  if (f.data.intent === "save") {
    await save();
    await audit(s, "ai_draft.edit", id);
    revalidatePath(`/teacher/ai/${id}`);
    return { ok: true, message: "Draft saved." };
  }

  // Accept: turn the edited draft into the real thing, always as a draft the teacher finishes.
  let next: string | null = null;
  if (tool === "lesson" || tool === "quiz") {
    const cls = await db.class.findFirst({ where: { id: stored.input.classId, schoolId: s.schoolId, teacherId: s.userId }, select: { id: true } });
    if (!cls) return { error: "You no longer teach this class." };
    if (tool === "lesson") {
      const d = v.data as DraftContent["lesson"];
      const lesson = await db.lesson.create({
        data: { ...lessonFields(d), schoolId: s.schoolId, classId: cls.id, authorId: s.userId, outcomeCode: stored.input.outcomeCode || null, scheduledFor: schoolTime(1, 9), status: "DRAFT" },
      });
      await save({ createdId: lesson.id }, "ACCEPTED");
      await audit(s, "lesson.create", lesson.id, { fromAiDraft: id });
      revalidatePath("/teacher/lessons");
      next = `/teacher/lessons/${lesson.id}`;
    } else {
      const d = v.data as DraftContent["quiz"];
      const a = await db.assignment.create({
        data: {
          schoolId: s.schoolId, classId: cls.id, authorId: s.userId, title: d.title, instructions: d.instructions,
          dueAt: schoolTime(7, 15), status: "DRAFT", questions: { create: quizQuestionRows(d) },
        },
      });
      await save({ createdId: a.id }, "ACCEPTED");
      await audit(s, "assignment.create", a.id, { fromAiDraft: id });
      revalidatePath("/teacher/assignments");
      next = `/teacher/assignments/${a.id}/edit`;
    }
  } else if (tool === "feedback") {
    const sub = await ownSubmission(s, stored.input.submissionId);
    if (!sub) return { error: "That submission is no longer available." };
    await save({}, "ACCEPTED");
    next = `/teacher/assignments/${sub.assignment.id}/submissions/${sub.id}?aiDraft=${id}`;
  } else {
    await save({}, "ACCEPTED");
  }
  await audit(s, "ai_draft.accept", id, { tool });
  revalidatePath("/teacher/ai");
  if (next) redirect(next);
  return { ok: true, message: "Marked as used. Copy the text wherever you need it." };
}
