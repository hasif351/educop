"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { parseGrade, tempPassword, validateRoster, type RosterRow } from "@/lib/roster";
import type { FormState } from "./_ui/form-state";

// School-admin actions. Each one re-checks the role, scopes every lookup to
// the admin's schoolId and writes an audit entry.

type S = Awaited<ReturnType<typeof requireRole>>;
const admin = () => requireRole("SCHOOL_ADMIN");
const id = z.string().min(1).max(40);

async function seatsLeft(schoolId: string) {
  const [school, students] = await Promise.all([
    db.school.findUniqueOrThrow({ where: { id: schoolId }, select: { seatLimit: true } }),
    db.user.count({ where: { schoolId, role: "STUDENT", active: true } }),
  ]);
  return school.seatLimit - students;
}

// ---------------- People ----------------

const NewUser = z.object({
  name: z.string().trim().min(2, "Enter the person's full name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
  role: z.enum(["STUDENT", "TEACHER", "PARENT", "SCHOOL_ADMIN"]),
  grade: z.string().max(10).optional(),
});

export type NewUserState = { error?: string; created?: { name: string; email: string; password: string } };

export async function createUser(_: NewUserState, form: FormData): Promise<NewUserState> {
  const s = await admin();
  const parsed = NewUser.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  let gradeLevel: number | null = null;
  if (v.role === "STUDENT") {
    gradeLevel = parseGrade(v.grade ?? "");
    if (gradeLevel == null) return { error: "Students need a grade: KG1, KG2 or 1–12." };
    if ((await seatsLeft(s.schoolId)) <= 0) return { error: "The school has used all its student seats. Ask Educop to raise the seat limit." };
  }
  if (await db.user.findUnique({ where: { email: v.email }, select: { id: true } })) return { error: "That email already has an account." };
  const password = tempPassword();
  const user = await db.user.create({ data: { schoolId: s.schoolId, role: v.role, name: v.name, email: v.email, gradeLevel, passwordHash: await bcrypt.hash(password, 10) } });
  await audit(s, "user.create", user.id, { role: v.role });
  revalidatePath("/admin/users");
  return { created: { name: user.name, email: user.email, password } };
}

export async function setUserActive(userId: string, active: boolean) {
  const s = await admin();
  id.parse(userId);
  if (userId === s.userId) throw new Error("You can't deactivate your own account");
  const u = await db.user.findFirst({ where: { id: userId, schoolId: s.schoolId }, select: { id: true, role: true, active: true } });
  if (!u) throw new Error("User not found");
  if (active && !u.active && u.role === "STUDENT" && (await seatsLeft(s.schoolId)) <= 0) throw new Error("No seats left");
  await db.user.update({ where: { id: u.id }, data: { active } });
  await audit(s, active ? "user.reactivate" : "user.deactivate", u.id);
  revalidatePath("/admin/users");
}

const Link = z.object({
  parentEmail: z.string().trim().toLowerCase().email("Enter the parent's email.").max(200),
  studentEmail: z.string().trim().toLowerCase().email("Enter the student's email.").max(200),
});

export async function linkParent(_: FormState, form: FormData): Promise<FormState> {
  const s = await admin();
  const parsed = Link.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [parent, student] = await Promise.all([
    db.user.findFirst({ where: { email: parsed.data.parentEmail, schoolId: s.schoolId, role: "PARENT" }, select: { id: true, name: true } }),
    db.user.findFirst({ where: { email: parsed.data.studentEmail, schoolId: s.schoolId, role: "STUDENT" }, select: { id: true, name: true } }),
  ]);
  if (!parent) return { error: "No parent with that email in this school. Add them as a parent first." };
  if (!student) return { error: "No student with that email in this school." };
  // A link the school creates itself is verified straight away.
  await db.parentStudent.upsert({
    where: { parentId_studentId: { parentId: parent.id, studentId: student.id } },
    update: { verified: true }, create: { parentId: parent.id, studentId: student.id, verified: true },
  });
  await audit(s, "parent_link.create", `${parent.id}:${student.id}`);
  revalidatePath("/admin/users");
  return { ok: `${parent.name} is now linked to ${student.name} (verified).` };
}

async function schoolLink(s: S, parentId: string, studentId: string) {
  const l = await db.parentStudent.findFirst({ where: { parentId: id.parse(parentId), studentId: id.parse(studentId), parent: { schoolId: s.schoolId }, student: { schoolId: s.schoolId } } });
  if (!l) throw new Error("Link not found");
  return l;
}

export async function verifyLink(parentId: string, studentId: string) {
  const s = await admin();
  await schoolLink(s, parentId, studentId);
  await db.parentStudent.update({ where: { parentId_studentId: { parentId, studentId } }, data: { verified: true } });
  await audit(s, "parent_link.verify", `${parentId}:${studentId}`);
  await notify([parentId], { schoolId: s.schoolId, kind: "system", title: "Your child's account is linked", body: "The school verified your link. You can now follow their learning.", href: "/parent" });
  revalidatePath("/admin/users");
}

export async function removeLink(parentId: string, studentId: string) {
  const s = await admin();
  await schoolLink(s, parentId, studentId);
  await db.parentStudent.delete({ where: { parentId_studentId: { parentId, studentId } } });
  await audit(s, "parent_link.remove", `${parentId}:${studentId}`);
  revalidatePath("/admin/users");
}

// ---------------- Roster import ----------------

export type RosterState = {
  error?: string;
  preview?: RosterRow[];
  seatsLeft?: number;
  created?: { name: string; email: string; role: string; password: string }[];
  skipped?: number;
};

const Roster = z.object({ csv: z.string().max(200_000, "That file is too large. Import at most 200 people at a time."), intent: z.enum(["preview", "commit"]) });

async function rosterCheck(s: S, csv: string) {
  const emails = [...new Set([...csv.toLowerCase().matchAll(/[^\s,;"]+@[^\s,;"]+/g)].map((m) => m[0]))];
  const [existing, left] = await Promise.all([
    // Only the emails in this file are looked up.
    db.user.findMany({ where: { email: { in: emails } }, select: { email: true, role: true, schoolId: true } }),
    seatsLeft(s.schoolId),
  ]);
  const ctx = {
    existingEmails: new Set(existing.map((u) => u.email)),
    schoolParentEmails: new Set(existing.filter((u) => u.role === "PARENT" && u.schoolId === s.schoolId).map((u) => u.email)),
    seatsLeft: Math.max(0, left),
  };
  return { ...validateRoster(csv, ctx), seatsLeft: ctx.seatsLeft };
}

export async function importRoster(_: RosterState, form: FormData): Promise<RosterState> {
  const s = await admin();
  const parsed = Roster.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { rows, fileError, seatsLeft: left } = await rosterCheck(s, parsed.data.csv);
  if (fileError) return { error: fileError };
  if (parsed.data.intent === "preview") return { preview: rows, seatsLeft: left };

  // Commit: the same checks run again, and only rows without errors are created.
  const ok = rows.filter((r) => r.errors.length === 0);
  if (ok.length === 0) return { error: "No rows are ready to import. Fix the rows marked below and preview again.", preview: rows, seatsLeft: left };
  const withPw = await Promise.all(ok.map(async (r) => {
    const password = tempPassword();
    return { r, password, hash: await bcrypt.hash(password, 10) };
  }));
  const created = await db.$transaction(async (tx) => {
    const ids = new Map<string, string>();
    // Parents first so students in the same file can be linked to them.
    for (const { r, hash } of [...withPw].sort((a, b) => Number(b.r.role === "PARENT") - Number(a.r.role === "PARENT"))) {
      const u = await tx.user.create({ data: { schoolId: s.schoolId, role: r.role!, name: r.name, email: r.email, gradeLevel: r.gradeLevel, passwordHash: hash } });
      ids.set(r.email, u.id);
    }
    for (const { r } of withPw.filter((x) => x.r.parentEmail)) {
      const parentId = ids.get(r.parentEmail!) ?? (await tx.user.findFirst({ where: { email: r.parentEmail!, schoolId: s.schoolId, role: "PARENT" }, select: { id: true } }))?.id;
      if (parentId) await tx.parentStudent.create({ data: { parentId, studentId: ids.get(r.email)!, verified: true } });
    }
    return withPw.map(({ r, password }) => ({ name: r.name, email: r.email, role: r.role!, password }));
  }, { timeout: 30_000 });
  await audit(s, "user.import", undefined, { created: created.length, skipped: rows.length - ok.length });
  revalidatePath("/admin/users");
  return { created, skipped: rows.length - ok.length };
}

// ---------------- Classes & subjects ----------------

const NewClass = z.object({
  name: z.string().trim().min(2, "Give the class a name, e.g. 5B Mathematics.").max(80),
  subjectId: z.string().min(1, "Choose a subject."),
  teacherId: z.string().min(1, "Choose a teacher."),
  academicYearId: z.string().min(1, "Choose an academic year."),
  grade: z.string().min(1, "Choose a grade."),
});

export async function createClass(_: FormState, form: FormData): Promise<FormState> {
  const s = await admin();
  const parsed = NewClass.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const gradeLevel = parseGrade(v.grade);
  if (gradeLevel == null) return { error: "Choose a grade from KG1 to 12." };
  const [subject, teacher, year] = await Promise.all([
    db.subject.findFirst({ where: { id: v.subjectId, schoolId: s.schoolId } }),
    db.user.findFirst({ where: { id: v.teacherId, schoolId: s.schoolId, role: "TEACHER", active: true } }),
    db.academicYear.findFirst({ where: { id: v.academicYearId, schoolId: s.schoolId } }),
  ]);
  if (!subject || !teacher || !year) return { error: "Choose a subject, teacher and year from this school." };
  const c = await db.class.create({ data: { schoolId: s.schoolId, name: v.name, subjectId: subject.id, teacherId: teacher.id, academicYearId: year.id, gradeLevel } });
  await audit(s, "class.create", c.id);
  await notify([teacher.id], { schoolId: s.schoolId, kind: "class", title: `You're teaching ${c.name}`, body: "The school added you as the class teacher.", href: "/teacher" });
  revalidatePath("/admin/classes");
  return { ok: `${c.name} created. Open it to enrol students.` };
}

export async function updateClassTeacher(classId: string, _: FormState, form: FormData): Promise<FormState> {
  const s = await admin();
  const teacherId = id.safeParse(form.get("teacherId"));
  if (!teacherId.success) return { error: "Choose a teacher." };
  const [c, teacher] = await Promise.all([
    db.class.findFirst({ where: { id: id.parse(classId), schoolId: s.schoolId } }),
    db.user.findFirst({ where: { id: teacherId.data, schoolId: s.schoolId, role: "TEACHER", active: true } }),
  ]);
  if (!c || !teacher) return { error: "Choose a teacher from this school." };
  await db.class.update({ where: { id: c.id }, data: { teacherId: teacher.id } });
  await audit(s, "class.teacher", c.id, { teacherId: teacher.id });
  revalidatePath(`/admin/classes/${c.id}`);
  return { ok: `${teacher.name} now teaches ${c.name}.` };
}

const NewSubject = z.object({
  name: z.string().trim().min(2, "Enter a subject name.").max(60),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,6}$/, "Use a short code of 1–6 letters or digits, e.g. MA."),
  color: z.enum(["blue", "teal", "warn", "good"]).default("blue"),
});

export async function createSubject(_: FormState, form: FormData): Promise<FormState> {
  const s = await admin();
  const parsed = NewSubject.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (await db.subject.findFirst({ where: { schoolId: s.schoolId, code: parsed.data.code } })) return { error: "Another subject already uses that code." };
  const sub = await db.subject.create({ data: { schoolId: s.schoolId, ...parsed.data } });
  await audit(s, "subject.create", sub.id);
  revalidatePath("/admin/classes");
  return { ok: `${sub.name} added.` };
}

export async function deleteSubject(subjectId: string) {
  const s = await admin();
  const sub = await db.subject.findFirst({ where: { id: id.parse(subjectId), schoolId: s.schoolId }, include: { _count: { select: { classes: true } } } });
  if (!sub) throw new Error("Subject not found");
  if (sub._count.classes > 0) throw new Error("Subject still has classes");
  await db.subject.delete({ where: { id: sub.id } });
  await audit(s, "subject.delete", sub.id);
  revalidatePath("/admin/classes");
}

export async function enrolStudents(classId: string, _: FormState, form: FormData): Promise<FormState> {
  const s = await admin();
  const ids = z.array(id).max(200).safeParse(form.getAll("studentId"));
  if (!ids.success || ids.data.length === 0) return { error: "Tick at least one student." };
  const c = await db.class.findFirst({ where: { id: id.parse(classId), schoolId: s.schoolId } });
  if (!c) return { error: "Class not found." };
  const students = await db.user.findMany({ where: { id: { in: ids.data }, schoolId: s.schoolId, role: "STUDENT", active: true }, select: { id: true } });
  const r = await db.enrollment.createMany({ data: students.map((st) => ({ classId: c.id, studentId: st.id })), skipDuplicates: true });
  await audit(s, "class.enrol", c.id, { count: r.count });
  revalidatePath(`/admin/classes/${c.id}`);
  return { ok: `${r.count} student${r.count === 1 ? "" : "s"} enrolled.` };
}

export async function unenrolStudent(classId: string, studentId: string) {
  const s = await admin();
  const e = await db.enrollment.findFirst({ where: { classId: id.parse(classId), studentId: id.parse(studentId), class: { schoolId: s.schoolId } } });
  if (!e) throw new Error("Enrolment not found");
  await db.enrollment.delete({ where: { classId_studentId: { classId, studentId } } });
  await audit(s, "class.unenrol", classId, { studentId });
  revalidatePath(`/admin/classes/${classId}`);
}

// ---------------- Approvals ----------------

export async function approveLesson(lessonId: string) {
  const s = await admin();
  const l = await db.lesson.findFirst({ where: { id: id.parse(lessonId), schoolId: s.schoolId, status: "PENDING_APPROVAL" } });
  if (!l) throw new Error("Lesson not found");
  await db.lesson.update({ where: { id: l.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  await audit(s, "lesson.approve", l.id);
  await notify([l.authorId], { schoolId: s.schoolId, kind: "class", title: `Approved: ${l.title}`, body: "Your lesson is published and students can see it.", href: `/teacher/lessons/${l.id}` });
  revalidatePath("/admin/approvals", "layout");
}

const ReturnNote = z.object({ note: z.string().trim().min(3, "Tell the teacher what to change.").max(1000) });

export async function returnLesson(lessonId: string, _: FormState, form: FormData): Promise<FormState> {
  const s = await admin();
  const parsed = ReturnNote.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const l = await db.lesson.findFirst({ where: { id: id.parse(lessonId), schoolId: s.schoolId, status: "PENDING_APPROVAL" } });
  if (!l) return { error: "This lesson is no longer waiting for approval." };
  await db.lesson.update({ where: { id: l.id }, data: { status: "DRAFT" } });
  await audit(s, "lesson.return", l.id, { note: parsed.data.note });
  await notify([l.authorId], { schoolId: s.schoolId, kind: "class", title: `Changes requested: ${l.title}`, body: parsed.data.note, href: `/teacher/lessons/${l.id}` });
  revalidatePath("/admin/approvals", "layout");
  redirect("/admin/approvals?returned=1");
}

// ---------------- Moderation ----------------

async function openItem(s: S, itemId: string) {
  const item = await db.moderationItem.findFirst({ where: { id: id.parse(itemId), schoolId: s.schoolId, status: "OPEN" } });
  if (!item) throw new Error("Item not found");
  return item;
}

export async function closeModeration(itemId: string, decision: "RESOLVED" | "DISMISSED") {
  const s = await admin();
  const item = await openItem(s, itemId);
  await db.moderationItem.update({ where: { id: item.id }, data: { status: z.enum(["RESOLVED", "DISMISSED"]).parse(decision), resolvedById: s.userId, resolvedAt: new Date() } });
  await audit(s, `moderation.${decision.toLowerCase()}`, item.id);
  revalidatePath("/admin/moderation");
}

/** Held messages: release delivers it to the recipient; keep hidden leaves it held. */
export async function decideHeldMessage(itemId: string, release: boolean) {
  const s = await admin();
  const item = await openItem(s, itemId);
  const msg = item.kind === "message" && item.sourceId ? await db.message.findFirst({ where: { id: item.sourceId, schoolId: s.schoolId } }) : null;
  if (!msg) throw new Error("Message not found");
  await db.$transaction([
    db.message.update({ where: { id: msg.id }, data: { held: !release } }),
    db.moderationItem.update({ where: { id: item.id }, data: { status: "RESOLVED", resolvedById: s.userId, resolvedAt: new Date() } }),
  ]);
  await audit(s, release ? "message.release" : "message.keep_hidden", msg.id, { item: item.id });
  if (release) await notify([msg.toId], { schoolId: s.schoolId, kind: "message", title: "New message", body: "A message was delivered after review.", href: undefined });
  revalidatePath("/admin/moderation");
}

// ---------------- School settings ----------------

const SchoolInput = z.object({
  name: z.string().trim().min(3, "Enter the school name.").max(120),
  city: z.string().trim().max(80).optional().default(""),
  curriculum: z.string().trim().min(2, "Choose a curriculum.").max(60),
  timezone: z.string().trim().max(60).refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Choose a valid time zone."),
  requireLessonApproval: z.literal("on").optional(),
  aiEnabled: z.literal("on").optional(),
});

export async function updateSchool(_: FormState, form: FormData): Promise<FormState> {
  const s = await admin();
  const parsed = SchoolInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  await db.school.update({ where: { id: s.schoolId }, data: {
    name: v.name, city: v.city || null, curriculum: v.curriculum, timezone: v.timezone,
    requireLessonApproval: v.requireLessonApproval === "on", aiEnabled: v.aiEnabled === "on",
  } });
  await audit(s, "school.update", s.schoolId, { requireLessonApproval: v.requireLessonApproval === "on", aiEnabled: v.aiEnabled === "on" });
  revalidatePath("/admin", "layout");
  return { ok: "School settings saved." };
}

const Year = z.object({
  name: z.string().trim().min(4, "Name the year, e.g. 2027–28.").max(20),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date."),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an end date."),
});

export async function addAcademicYear(_: FormState, form: FormData): Promise<FormState> {
  const s = await admin();
  const parsed = Year.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const startsOn = new Date(parsed.data.startsOn), endsOn = new Date(parsed.data.endsOn);
  if (endsOn <= startsOn) return { error: "The year must end after it starts." };
  const hasCurrent = await db.academicYear.count({ where: { schoolId: s.schoolId, isCurrent: true } });
  const y = await db.academicYear.create({ data: { schoolId: s.schoolId, name: parsed.data.name, startsOn, endsOn, isCurrent: hasCurrent === 0 } });
  await audit(s, "academic_year.create", y.id);
  revalidatePath("/admin/school");
  return { ok: `${y.name} added.` };
}

export async function setCurrentYear(yearId: string) {
  const s = await admin();
  const y = await db.academicYear.findFirst({ where: { id: id.parse(yearId), schoolId: s.schoolId } });
  if (!y) throw new Error("Year not found");
  await db.$transaction([
    db.academicYear.updateMany({ where: { schoolId: s.schoolId }, data: { isCurrent: false } }),
    db.academicYear.update({ where: { id: y.id }, data: { isCurrent: true } }),
  ]);
  await audit(s, "academic_year.current", y.id);
  revalidatePath("/admin/school");
}
