"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { CONSENT_KEYS, LANGUAGES, TIME_ZONES, checkboxes, mergePrefs } from "@/lib/prefs";
import { SESSION_COOKIE, sessionTtlSeconds, signSession } from "@/lib/session";
import { ROLE_HOME } from "@/lib/roles";

// Notifications and settings actions shared by every role. Each one acts only on
// the signed-in user's own rows (or, for consents, a parent's verified child).

const ALL = ["STUDENT", "TEACHER", "PARENT", "SCHOOL_ADMIN", "SUPER_ADMIN"] as const;
export type FormState = { error?: string; ok?: string };

// ---------------- Notifications ----------------

const Id = z.string().min(1).max(40);

export async function markNotificationRead(id: string) {
  const s = await requireRole(...ALL);
  await db.notification.updateMany({ where: { id: Id.parse(id), userId: s.userId, readAt: null }, data: { readAt: new Date() } });
  revalidatePath(`${ROLE_HOME[s.role]}`, "layout");
}

/** Marks the notification read, then follows its link if it points inside the user's own area. */
export async function openNotification(id: string) {
  const s = await requireRole(...ALL);
  const n = await db.notification.findFirst({ where: { id: Id.parse(id), userId: s.userId } });
  if (!n) return;
  if (!n.readAt) await db.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  const home = ROLE_HOME[s.role];
  const safe = n.href && (n.href === home || n.href.startsWith(home + "/")) ? n.href : `${home}/notifications`;
  redirect(safe);
}

export async function markAllNotificationsRead() {
  const s = await requireRole(...ALL);
  await db.notification.updateMany({ where: { userId: s.userId, readAt: null }, data: { readAt: new Date() } });
  revalidatePath(`${ROLE_HOME[s.role]}`, "layout");
}

// ---------------- Profile ----------------

const Profile = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80, "Keep your name under 80 characters."),
  language: z.enum(LANGUAGES.map((l) => l.value) as ["en", "ar"]),
  timeZone: z.enum(TIME_ZONES.map((t) => t.value) as [string, ...string[]], { message: "Choose a time zone from the list." }),
});

export async function saveProfile(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireRole(...ALL);
  const parsed = Profile.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const user = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { prefs: true } });
  await db.user.update({ where: { id: s.userId }, data: { name: v.name, prefs: mergePrefs(user.prefs, { language: v.language, timeZone: v.timeZone }) } });
  // The name is shown from the session, so re-issue it.
  if (v.name !== s.name) {
    (await cookies()).set(SESSION_COOKIE, await signSession({ userId: s.userId, role: s.role, schoolId: s.schoolId, name: v.name }), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: sessionTtlSeconds(),
    });
  }
  await audit(s, "settings.profile", s.userId);
  revalidatePath(ROLE_HOME[s.role], "layout");
  return { ok: "Profile saved." };
}

// ---------------- Password ----------------

const Password = z.object({
  current: z.string().min(1, "Enter your current password.").max(200),
  next: z.string().min(10, "Use at least 10 characters for your new password.").max(200),
  confirm: z.string().max(200),
}).refine((v) => v.next === v.confirm, { message: "The new passwords don't match." })
  .refine((v) => v.next !== v.current, { message: "Choose a password you haven't used here." });

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireRole(...ALL);
  const parsed = Password.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const user = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { passwordHash: true } });
  if (!(await bcrypt.compare(parsed.data.current, user.passwordHash))) return { error: "Your current password isn't right." };
  await db.user.update({ where: { id: s.userId }, data: { passwordHash: await bcrypt.hash(parsed.data.next, 10) } });
  await audit(s, "settings.password", s.userId);
  return { ok: "Password changed." };
}

// ---------------- Accessibility & notification preferences ----------------

const A11Y = ["largerText", "calm", "captions", "readAloud"] as const;
const NOTIFY = ["email", "push", "sms", "digest"] as const;

export async function savePrefs(group: "a11y" | "notify", _: FormState, form: FormData): Promise<FormState> {
  const s = await requireRole(...ALL);
  if (group !== "a11y" && group !== "notify") return { error: "Unknown settings." };
  const user = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { prefs: true } });
  const patch = group === "a11y" ? { a11y: checkboxes(form, A11Y) } : { notify: checkboxes(form, NOTIFY) };
  await db.user.update({ where: { id: s.userId }, data: { prefs: mergePrefs(user.prefs, patch) } });
  await audit(s, `settings.${group}`, s.userId, patch);
  revalidatePath(ROLE_HOME[s.role], "layout");
  return { ok: "Saved." };
}

// ---------------- Consents ----------------

const ConsentInput = z.object({ studentId: Id, key: z.enum(CONSENT_KEYS), granted: z.boolean() });

/** Parents set consents for a verified child. Stored on the child's userId. */
export async function setConsent(studentId: string, key: string, granted: boolean) {
  const s = await requireRole("PARENT");
  const v = ConsentInput.parse({ studentId, key, granted });
  const link = await db.parentStudent.findFirst({ where: { parentId: s.userId, studentId: v.studentId, verified: true, student: { schoolId: s.schoolId } } });
  if (!link) throw new Error("Child not found");
  await db.consent.upsert({
    where: { userId_key: { userId: v.studentId, key: v.key } },
    create: { userId: v.studentId, key: v.key, granted: v.granted },
    update: { granted: v.granted },
  });
  await audit(s, "consent.update", v.studentId, { key: v.key, granted: v.granted });
  revalidatePath("/parent/settings");
}

// ---------------- Data rights ----------------

/** Not a real delete: the school's data protection lead reviews it in the moderation queue. */
export async function requestDeletion(_: FormState, form: FormData): Promise<FormState> {
  const s = await requireRole(...ALL);
  const reason = z.string().trim().max(1000).default("").parse(form.get("reason") ?? "");
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm you want to ask for deletion." };
  const open = await db.moderationItem.findFirst({ where: { kind: "content", sourceId: s.userId, status: "OPEN", summary: { startsWith: "Account deletion request" } } });
  if (open) return { ok: "Your request is already with the school. They will contact you." };
  const item = await db.moderationItem.create({
    data: {
      schoolId: s.schoolId, kind: "content", sourceId: s.userId,
      summary: `Account deletion request from ${s.name} (${s.role.toLowerCase().replace("_", " ")})${reason ? `: "${reason}"` : ""}`,
    },
  });
  await audit(s, "privacy.deletion_request", item.id);
  return { ok: "Request sent. The school's data protection lead will review it and contact you. Nothing is deleted until then." };
}
