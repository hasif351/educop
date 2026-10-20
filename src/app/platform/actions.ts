"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { tempPassword } from "@/lib/roster";
import type { FormState } from "@/app/admin/_ui/form-state";

// Platform-admin actions (SUPER_ADMIN). Audit entries carry the affected
// school's id so the school's own admin can see what the platform changed.

const platform = () => requireRole("SUPER_ADMIN");
const id = z.string().min(1).max(40);
const PLANS = ["Pilot", "Trial", "Standard", "Enterprise"] as const;

const NewSchool = z.object({
  organizationId: z.string().max(40).optional().default(""),
  organizationName: z.string().trim().max(120).optional().default(""),
  name: z.string().trim().min(3, "Enter the school name.").max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/, "Use a short web name: lower-case letters, digits and dashes, e.g. harbour-lights."),
  city: z.string().trim().max(80).optional().default(""),
  curriculum: z.string().trim().min(2).max(60),
  plan: z.enum(PLANS),
  seatLimit: z.coerce.number().int().min(1, "Seat limit must be at least 1.").max(100_000),
  adminName: z.string().trim().min(2, "Enter the school admin's name.").max(120),
  adminEmail: z.string().trim().toLowerCase().email("Enter the school admin's email.").max(200),
});

export type NewSchoolState = { error?: string; created?: { school: string; email: string; password: string } };

/** "Add a school": organisation (existing or new), the school, and its first school admin. */
export async function createSchool(_: NewSchoolState, form: FormData): Promise<NewSchoolState> {
  const s = await platform();
  const parsed = NewSchool.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  if (!v.organizationId && v.organizationName.length < 2) return { error: "Choose an organisation or enter a new one." };
  if (v.organizationId && !(await db.organization.findUnique({ where: { id: v.organizationId } }))) return { error: "Organisation not found." };
  if (await db.school.findUnique({ where: { slug: v.slug } })) return { error: "Another school already uses that web name." };
  if (await db.user.findUnique({ where: { email: v.adminEmail } })) return { error: "That admin email already has an account." };

  const password = tempPassword();
  const passwordHash = await bcrypt.hash(password, 10);
  const school = await db.$transaction(async (tx) => {
    const orgId = v.organizationId || (await tx.organization.create({ data: { name: v.organizationName } })).id;
    const sc = await tx.school.create({ data: { organizationId: orgId, name: v.name, slug: v.slug, city: v.city || null, curriculum: v.curriculum, plan: v.plan, seatLimit: v.seatLimit } });
    await tx.user.create({ data: { schoolId: sc.id, role: "SCHOOL_ADMIN", name: v.adminName, email: v.adminEmail, passwordHash } });
    return sc;
  });
  await audit({ userId: s.userId, schoolId: school.id }, "school.create", school.id, { plan: v.plan, seatLimit: v.seatLimit });
  revalidatePath("/platform", "layout");
  return { created: { school: school.name, email: v.adminEmail, password } };
}

export async function setSchoolActive(schoolId: string, active: boolean) {
  const s = await platform();
  const sc = await db.school.findUnique({ where: { id: id.parse(schoolId) } });
  if (!sc) throw new Error("School not found");
  await db.school.update({ where: { id: sc.id }, data: { active } });
  await audit({ userId: s.userId, schoolId: sc.id }, active ? "school.reactivate" : "school.suspend", sc.id);
  revalidatePath("/platform", "layout");
}

const Plan = z.object({ plan: z.enum(PLANS), seatLimit: z.coerce.number().int().min(1, "Seat limit must be at least 1.").max(100_000) });

export async function updatePlan(schoolId: string, _: FormState, form: FormData): Promise<FormState> {
  const s = await platform();
  const parsed = Plan.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const sc = await db.school.findUnique({ where: { id: id.parse(schoolId) } });
  if (!sc) return { error: "School not found." };
  const students = await db.user.count({ where: { schoolId: sc.id, role: "STUDENT", active: true } });
  if (parsed.data.seatLimit < students) return { error: `The school already has ${students} active students.` };
  await db.school.update({ where: { id: sc.id }, data: parsed.data });
  await audit({ userId: s.userId, schoolId: sc.id }, "school.plan", sc.id, parsed.data);
  revalidatePath("/platform", "layout");
  return { ok: "Saved." };
}

export async function closePlatformModeration(itemId: string, decision: "RESOLVED" | "DISMISSED") {
  const s = await platform();
  const item = await db.moderationItem.findFirst({ where: { id: id.parse(itemId), status: "OPEN" } });
  if (!item) throw new Error("Item not found");
  await db.moderationItem.update({ where: { id: item.id }, data: { status: z.enum(["RESOLVED", "DISMISSED"]).parse(decision), resolvedById: s.userId, resolvedAt: new Date() } });
  await audit({ userId: s.userId, schoolId: item.schoolId }, `moderation.${decision.toLowerCase()}`, item.id, { by: "platform" });
  revalidatePath("/platform", "layout");
}
