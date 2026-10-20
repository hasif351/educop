"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { award } from "@/lib/points";
import { notify } from "@/lib/notify";
import { dayBounds } from "@/lib/data";
import { checkStreakBadge } from "@/lib/gamify";
import { FEELINGS, HABITS, REFLECTION_ONLY, SCENARIOS, needsCare } from "@/lib/sel";
import { dayKey } from "@/lib/streak";

export type GrowthState = { error?: string; ok?: boolean; care?: boolean; thought?: string };

const Checkin = z.object({
  mood: z.coerce.number({ invalid_type_error: "Pick how you feel today." }).int().min(1, "Pick how you feel today.").max(5),
  feelings: z.array(z.enum(FEELINGS)).max(FEELINGS.length),
  note: z.string().trim().max(500, "Keep your note under 500 characters.").default(""),
  shared: z.boolean(),
  sharedWithParent: z.boolean(),
});

export async function saveCheckin(_: GrowthState, form: FormData): Promise<GrowthState> {
  const s = await requireRole("STUDENT");
  const parsed = Checkin.safeParse({
    mood: form.get("mood") ?? undefined, feelings: form.getAll("feelings"), note: form.get("note") ?? "", shared: form.get("shared") === "on", sharedWithParent: form.get("sharedWithParent") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const c = await db.selCheckin.create({ data: { schoolId: s.schoolId, studentId: s.userId, mood: v.mood, feelings: v.feelings, note: v.note, shared: v.shared, sharedWithParent: v.sharedWithParent } });
  await award(s.userId, s.schoolId, 5, "Daily check-in", `checkin:${dayKey(new Date())}`);
  await checkStreakBadge(s.userId, s.schoolId);
  // The audit trail records that a check-in happened, never what it said.
  await audit(s, "sel.checkin", c.id, { shared: v.shared, sharedWithParent: v.sharedWithParent });
  revalidatePath("/student/growth");
  return { ok: true, care: needsCare(v.mood, v.feelings) };
}

const Reflection = z.object({
  scenario: z.string().refine((id) => SCENARIOS.some((x) => x.id === id), "Pick a scenario."),
  option: z.coerce.number().int().min(0).max(3).optional(),
  response: z.string().trim().min(3, "Write a sentence about what you would do.").max(1000, "Keep it under 1000 characters."),
  shared: z.boolean(),
  sharedWithParent: z.boolean(),
});

export async function saveReflection(_: GrowthState, form: FormData): Promise<GrowthState> {
  const s = await requireRole("STUDENT");
  const opt = form.get("option");
  const parsed = Reflection.safeParse({ scenario: form.get("scenario") ?? "", option: opt === null || opt === "" ? undefined : opt, response: form.get("response") ?? "", shared: form.get("shared") === "on", sharedWithParent: form.get("sharedWithParent") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const sc = SCENARIOS.find((x) => x.id === v.scenario)!;
  const picked = v.option != null ? sc.options[v.option] : null;
  const c = await db.selCheckin.create({
    data: { schoolId: s.schoolId, studentId: s.userId, mood: REFLECTION_ONLY, feelings: [], note: picked ? `Picked: ${picked.text}` : "", scenario: sc.id, response: v.response, shared: v.shared, sharedWithParent: v.sharedWithParent },
  });
  await award(s.userId, s.schoolId, 5, "Scenario reflection", `reflect:${dayKey(new Date())}`);
  await audit(s, "sel.reflection", c.id, { scenario: sc.id, shared: v.shared, sharedWithParent: v.sharedWithParent });
  revalidatePath("/student/growth");
  return { ok: true, thought: picked?.thought ?? "Thanks for thinking it through. There's no right or wrong answer here." };
}

const Goal = z.object({ text: z.string().trim().min(3, "Write your goal in a few words.").max(120, "Keep goals under 120 characters.") });

export async function addGoal(_: GrowthState, form: FormData): Promise<GrowthState> {
  const s = await requireRole("STUDENT");
  const parsed = Goal.safeParse({ text: form.get("text") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const open = await db.selGoal.count({ where: { schoolId: s.schoolId, studentId: s.userId, doneAt: null } });
  if (open >= 8) return { error: "You have 8 goals on the go. Finish or remove one first." };
  const g = await db.selGoal.create({ data: { schoolId: s.schoolId, studentId: s.userId, text: parsed.data.text } });
  await audit(s, "sel.goal_add", g.id);
  revalidatePath("/student/growth");
  return { ok: true };
}

async function ownGoal(goalId: string) {
  const s = await requireRole("STUDENT");
  const g = await db.selGoal.findFirst({ where: { id: z.string().min(1).max(40).parse(goalId), schoolId: s.schoolId, studentId: s.userId } });
  if (!g) throw new Error("Goal not found");
  return { s, g };
}

export async function completeGoal(goalId: string) {
  const { s, g } = await ownGoal(goalId);
  if (g.doneAt) return;
  await db.selGoal.update({ where: { id: g.id }, data: { doneAt: new Date() } });
  await award(s.userId, s.schoolId, 15, "Completed a personal goal", `goal:${g.id}`, "goal_done");
  await audit(s, "sel.goal_done", g.id);
  revalidatePath("/student/growth");
  revalidatePath("/student");
}

export async function removeGoal(goalId: string) {
  const { s, g } = await ownGoal(goalId);
  await db.selGoal.delete({ where: { id: g.id } });
  await audit(s, "sel.goal_remove", g.id);
  revalidatePath("/student/growth");
}

const Habit = z.object({ key: z.enum(HABITS.map((h) => h.key) as [string, ...string[]]), on: z.boolean() });

/** Study habits live in User.prefs.habits; other prefs keys are left untouched. */
export async function setHabit(key: string, on: boolean) {
  const s = await requireRole("STUDENT");
  const v = Habit.parse({ key, on });
  const user = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { prefs: true } });
  const prefs = (user.prefs && typeof user.prefs === "object" && !Array.isArray(user.prefs) ? user.prefs : {}) as Record<string, unknown>;
  const habits = { ...((prefs.habits as Record<string, boolean>) ?? {}), [v.key]: v.on };
  await db.user.update({ where: { id: s.userId }, data: { prefs: { ...prefs, habits } } });
  revalidatePath("/student/growth");
}

/** The student asks their teachers for a quick private chat. Once a day at most. */
export async function requestCheckin(): Promise<GrowthState> {
  const s = await requireRole("STUDENT");
  const { start } = dayBounds();
  const already = await db.auditLog.count({ where: { actorId: s.userId, action: "sel.request_checkin", createdAt: { gte: start } } });
  if (already) return { ok: true };
  const classes = await db.class.findMany({ where: { schoolId: s.schoolId, enrollments: { some: { studentId: s.userId } } }, select: { teacherId: true } });
  await notify(classes.map((c) => c.teacherId), {
    schoolId: s.schoolId, kind: "system", title: `${s.name} asked for a quick check-in`,
    body: "They used the check-in button on their growth page. No details were shared.", href: "/teacher",
  });
  await audit(s, "sel.request_checkin");
  return { ok: true };
}
