"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { inMyClasses } from "@/lib/teacher-insights";
import { NOTE_PREFIX, REC_KINDS } from "./kinds";

type S = Awaited<ReturnType<typeof requireRole>>;
export type FormState = { error?: string; ok?: boolean };

/** A recommendation for a student in one of this teacher's classes, or null. */
function findRec(s: S, id: string) {
  return db.recommendation.findFirst({ where: { id, schoolId: s.schoolId, student: inMyClasses(s) } });
}

async function tellStudents(s: S, studentIds: string[], title: string) {
  await notify(studentIds, { schoolId: s.schoolId, kind: "ai", title: "New suggestion from your teacher", body: title, href: "/student/for-you" });
}

function refresh() {
  revalidatePath("/teacher/recommendations");
  revalidatePath("/teacher");
}

const NEXT: Record<"approve" | "dismiss" | "done", { from: ("PENDING_REVIEW" | "ACTIVE")[]; to: "ACTIVE" | "DISMISSED" | "DONE" }> = {
  approve: { from: ["PENDING_REVIEW"], to: "ACTIVE" },
  dismiss: { from: ["PENDING_REVIEW", "ACTIVE"], to: "DISMISSED" },
  done: { from: ["ACTIVE"], to: "DONE" },
};

export async function setRecommendationStatus(id: string, decision: "approve" | "dismiss" | "done") {
  const s = await requireRole("TEACHER");
  const step = NEXT[decision];
  if (!step) throw new Error("Unknown decision");
  const rec = await findRec(s, id);
  if (!rec || !step.from.includes(rec.status as "PENDING_REVIEW" | "ACTIVE")) throw new Error("Recommendation not found");
  await db.recommendation.update({ where: { id }, data: { status: step.to } });
  if (step.to === "ACTIVE") await tellStudents(s, [rec.studentId], rec.title);
  await audit(s, `recommendation.${decision}`, id);
  refresh();
}

const Kind = z.enum(REC_KINDS);
const Modify = z.object({
  title: z.string().trim().min(3, "Give the suggestion a title.").max(160),
  kind: Kind,
  note: z.string().trim().max(500).default(""),
  intent: z.enum(["save", "approve"]),
});

/** The teacher's note replaces any earlier note; the original evidence is never edited. */
function withNote(evidence: string[], note: string) {
  const kept = evidence.filter((e) => !e.startsWith(NOTE_PREFIX));
  return note ? [...kept, `${NOTE_PREFIX}${note}`] : kept;
}

export async function modifyRecommendation(id: string, _: FormState, form: FormData): Promise<FormState> {
  const s = await requireRole("TEACHER");
  const parsed = Modify.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const rec = await findRec(s, id);
  if (!rec || rec.status === "DONE" || rec.status === "DISMISSED") return { error: "This suggestion can no longer be changed." };
  const activate = v.intent === "approve" && rec.status === "PENDING_REVIEW";
  await db.recommendation.update({
    where: { id },
    data: { title: v.title, kind: v.kind, evidence: withNote(rec.evidence, v.note), ...(activate ? { status: "ACTIVE" as const } : {}) },
  });
  if (activate) await tellStudents(s, [rec.studentId], v.title);
  await audit(s, "recommendation.modify", id, { kind: v.kind, approved: activate });
  refresh();
  return { ok: true };
}

const Create = z.object({
  studentIds: z.array(z.string().min(1).max(40)).min(1, "Choose at least one student.").max(60),
  kind: Kind,
  title: z.string().trim().min(3, "Give the suggestion a title.").max(160),
  note: z.string().trim().max(500).default(""),
  lessonId: z.string().max(40).default(""),
  intent: z.enum(["assign", "review"]),
});

export async function createRecommendation(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireRole("TEACHER");
  const parsed = Create.safeParse({ ...Object.fromEntries(form), studentIds: form.getAll("studentIds") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const ids = [...new Set(v.studentIds)];
  const students = await db.user.findMany({ where: { id: { in: ids }, schoolId: s.schoolId, role: "STUDENT", ...inMyClasses(s) }, select: { id: true } });
  if (students.length !== ids.length) return { error: "You can only add suggestions for students in your classes." };
  if (v.lessonId) {
    const l = await db.lesson.findFirst({ where: { id: v.lessonId, schoolId: s.schoolId, class: { teacherId: s.userId } } });
    if (!l) return { error: "Choose one of your own lessons." };
  }

  const status = v.intent === "assign" ? ("ACTIVE" as const) : ("PENDING_REVIEW" as const);
  const evidence = [`Added by ${s.name}`, ...(ids.length > 1 ? [`Group suggestion for ${ids.length} students`] : []), ...(v.note ? [`${NOTE_PREFIX}${v.note}`] : [])];
  await db.recommendation.createMany({
    data: ids.map((studentId) => ({ schoolId: s.schoolId, studentId, kind: v.kind, title: v.title, evidence, lessonId: v.lessonId || null, status })),
  });
  if (status === "ACTIVE") await tellStudents(s, ids, v.title);
  await audit(s, "recommendation.create", undefined, { students: ids.length, kind: v.kind, status });
  refresh();
  return { ok: true };
}
