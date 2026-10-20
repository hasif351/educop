"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { autoScore, daysLate, lateCheck } from "@/lib/grading";
import { finalizeScore } from "@/lib/submit";
import { audit } from "@/lib/audit";

const Step = z.object({ lessonId: z.string().min(1), step: z.number().int().min(0).max(7), correct: z.number().int().min(0).optional(), total: z.number().int().min(0).optional() });

export async function completeLessonStep(input: z.infer<typeof Step>) {
  const s = await requireRole("STUDENT");
  const { lessonId, step, correct, total } = Step.parse(input);
  const lesson = await db.lesson.findFirst({ where: { id: lessonId, schoolId: s.schoolId, status: "PUBLISHED", class: { enrollments: { some: { studentId: s.userId } } } }, select: { id: true } });
  if (!lesson) throw new Error("Lesson not found");

  const existing = await db.lessonProgress.findUnique({ where: { lessonId_studentId: { lessonId, studentId: s.userId } } });
  const steps = Array.from(new Set([...(existing?.completedSteps ?? []), step])).sort((a, b) => a - b);
  const done = steps.length === 8;
  await db.lessonProgress.upsert({
    where: { lessonId_studentId: { lessonId, studentId: s.userId } },
    create: { lessonId, studentId: s.userId, completedSteps: steps, checkCorrect: correct ?? 0, checkTotal: total ?? 0, completedAt: done ? new Date() : null },
    update: { completedSteps: steps, ...(total != null ? { checkCorrect: correct ?? 0, checkTotal: total } : {}), completedAt: done ? (existing?.completedAt ?? new Date()) : null },
  });
  revalidatePath("/student");
  return { steps, done };
}

export type SubmitState = { error?: string; saved?: boolean };

export async function saveOrSubmit(assignmentId: string, _: SubmitState, form: FormData): Promise<SubmitState> {
  const s = await requireRole("STUDENT");
  const intent = form.get("intent") === "submit" ? "submit" : "save";
  const a = await db.assignment.findFirst({
    where: { id: assignmentId, schoolId: s.schoolId, status: "PUBLISHED", class: { enrollments: { some: { studentId: s.userId } } } },
    include: { questions: true, submissions: { where: { studentId: s.userId } } },
  });
  if (!a) return { error: "This assignment isn't available." };
  const prior = a.submissions[0];
  if (prior && prior.status !== "IN_PROGRESS") return { error: "You've already submitted this assignment." };

  const now = new Date();
  const late = daysLate(a.dueAt, now);
  if (intent === "submit") {
    const check = lateCheck(a, late);
    if (!check.accepted) return { error: check.reason };
  }

  const answers = a.questions.map((q) => {
    const raw = form.get(`q_${q.id}`);
    if (q.type === "MCQ") {
      const idx = raw == null || raw === "" ? null : Number(raw);
      const valid = idx != null && Number.isInteger(idx) && idx >= 0 && idx < q.options.length ? idx : null;
      return { questionId: q.id, choiceIndex: valid, text: null, autoScore: intent === "submit" ? autoScore(q, valid) : null };
    }
    const text = typeof raw === "string" ? raw.slice(0, 5000) : "";
    return { questionId: q.id, choiceIndex: null, text, autoScore: null };
  });

  if (intent === "submit") {
    const missing = answers.filter((x) => x.choiceIndex == null && !x.text?.trim()).length;
    if (missing) return { error: `Answer all questions before submitting (${missing} left).` };
  }

  const sub = await db.submission.upsert({
    where: { assignmentId_studentId: { assignmentId: a.id, studentId: s.userId } },
    create: { assignmentId: a.id, studentId: s.userId },
    update: {},
  });
  await db.$transaction(answers.map((x) => db.answer.upsert({
    where: { submissionId_questionId: { submissionId: sub.id, questionId: x.questionId } },
    create: { submissionId: sub.id, ...x },
    update: { choiceIndex: x.choiceIndex, text: x.text, autoScore: x.autoScore },
  })));

  if (intent === "save") {
    revalidatePath(`/student/assignments/${a.id}`);
    return { saved: true };
  }
  await db.submission.update({ where: { id: sub.id }, data: { status: "SUBMITTED", submittedAt: now, daysLate: late } });
  await finalizeScore(sub.id);
  await audit(s, "assignment.submit", a.id, { late });
  revalidatePath("/student");
  redirect(`/student/assignments/${a.id}?submitted=1`);
}
