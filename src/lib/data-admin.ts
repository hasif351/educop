import "server-only";
import { notFound } from "next/navigation";
import type { Prisma, Role } from "@prisma/client";
import { db } from "./db";
import { dayBounds } from "./data";
import { percent } from "./grading";
import { classReport, subjectReports, type ReportClass } from "./reports";
import type { SessionPayload } from "./session";

// School-admin reads. Everything is scoped to the admin's own schoolId; a
// guessed id from another school returns nothing (or a 404 for detail pages).

type S = SessionPayload & { schoolId: string };

/** Monday 00:00 of the current week in school time (GST). */
export function weekStart(now = new Date()) {
  const { start } = dayBounds(0, now);
  const dow = (new Date(start.getTime() + 4 * 3600_000).getUTCDay() + 6) % 7; // 0 = Monday
  return new Date(start.getTime() - dow * 86_400_000);
}

export async function schoolReportData(s: S): Promise<ReportClass[]> {
  const classes = await db.class.findMany({
    where: { schoolId: s.schoolId },
    include: {
      subject: { select: { name: true } }, teacher: { select: { name: true } }, _count: { select: { enrollments: true } },
      assignments: { where: { status: "PUBLISHED" }, select: { dueAt: true, submissions: { select: { status: true, finalScore: true, maxScore: true, daysLate: true } } } },
    },
    orderBy: { name: "asc" },
  });
  return classes.map((c) => ({ id: c.id, name: c.name, subject: c.subject.name, teacher: c.teacher.name, students: c._count.enrollments, assignments: c.assignments }));
}

export async function adminOverview(s: S) {
  const { start: today } = dayBounds();
  const week = weekStart();
  const [school, roleCounts, activeToday, studentsActiveToday, lessonsThisWeek, submittedThisWeek, graded, pendingApprovals, openModeration, pendingLinks, recentAudit, report] = await Promise.all([
    db.school.findUniqueOrThrow({ where: { id: s.schoolId }, include: { organization: true } }),
    db.user.groupBy({ by: ["role"], where: { schoolId: s.schoolId, active: true }, _count: true }),
    db.user.count({ where: { schoolId: s.schoolId, lastLoginAt: { gte: today } } }),
    db.user.count({ where: { schoolId: s.schoolId, role: "STUDENT", lastLoginAt: { gte: today } } }),
    db.lesson.count({ where: { schoolId: s.schoolId, status: "PUBLISHED", publishedAt: { gte: week } } }),
    db.submission.count({ where: { assignment: { schoolId: s.schoolId }, status: { not: "IN_PROGRESS" }, submittedAt: { gte: week } } }),
    db.submission.aggregate({ where: { assignment: { schoolId: s.schoolId }, status: "GRADED" }, _sum: { finalScore: true, maxScore: true }, _count: true }),
    db.lesson.count({ where: { schoolId: s.schoolId, status: "PENDING_APPROVAL" } }),
    db.moderationItem.count({ where: { schoolId: s.schoolId, status: "OPEN" } }),
    db.parentStudent.count({ where: { verified: false, student: { schoolId: s.schoolId } } }),
    db.auditLog.findMany({ where: { schoolId: s.schoolId }, include: { actor: { select: { name: true, role: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
    schoolReportData(s),
  ]);
  const count = (r: Role) => roleCounts.find((c) => c.role === r)?._count ?? 0;
  const teacherActivity = await db.user.findMany({
    where: { schoolId: s.schoolId, role: "TEACHER", active: true },
    select: { id: true, name: true, lastLoginAt: true, _count: { select: { createdLessons: { where: { status: "PUBLISHED" } }, createdAssigns: { where: { status: "PUBLISHED" } } } } },
    orderBy: { name: "asc" },
    take: 12,
  });
  return {
    school, students: count("STUDENT"), teachers: count("TEACHER"), parents: count("PARENT"), activeToday, studentsActiveToday,
    lessonsThisWeek, submittedThisWeek, avgScore: percent(graded._sum.finalScore ?? 0, graded._sum.maxScore ?? 0), gradedCount: graded._count,
    pendingApprovals, openModeration, pendingLinks, recentAudit, classes: report.map((c) => classReport(c)), teacherActivity,
  };
}

export async function schoolReports(s: S) {
  const data = await schoolReportData(s);
  return { classes: data.map((c) => classReport(c)), subjects: subjectReports(data) };
}

// ---------------- People ----------------

export const PAGE_SIZE = 50;

export async function adminUsers(s: S, f: { q?: string; role?: Role; status?: "active" | "inactive"; page?: number }) {
  const where: Prisma.UserWhereInput = {
    schoolId: s.schoolId,
    ...(f.role ? { role: f.role } : {}),
    ...(f.status ? { active: f.status === "active" } : {}),
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { email: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, role: true, gradeLevel: true, active: true, lastLoginAt: true,
        enrollments: { select: { class: { select: { name: true } } }, take: 4 },
        parentLinks: { select: { verified: true } },
        childrenLinks: { select: { verified: true, student: { select: { name: true } } } },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      skip: ((f.page ?? 1) - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.user.count({ where }),
  ]);
  return { users, total };
}

export async function parentLinks(s: S) {
  return db.parentStudent.findMany({
    where: { student: { schoolId: s.schoolId }, parent: { schoolId: s.schoolId } },
    include: { parent: { select: { id: true, name: true, email: true } }, student: { select: { id: true, name: true, gradeLevel: true } } },
    orderBy: [{ verified: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export async function seatUsage(s: S) {
  const [school, students] = await Promise.all([
    db.school.findUniqueOrThrow({ where: { id: s.schoolId }, select: { seatLimit: true } }),
    db.user.count({ where: { schoolId: s.schoolId, role: "STUDENT", active: true } }),
  ]);
  return { seatLimit: school.seatLimit, students, seatsLeft: Math.max(0, school.seatLimit - students) };
}

// ---------------- Classes ----------------

export async function adminClasses(s: S) {
  const [classes, subjects, teachers, years] = await Promise.all([
    db.class.findMany({
      where: { schoolId: s.schoolId },
      include: { subject: true, teacher: { select: { name: true } }, academicYear: { select: { name: true } }, _count: { select: { enrollments: true } } },
      orderBy: [{ gradeLevel: "asc" }, { name: "asc" }],
    }),
    db.subject.findMany({ where: { schoolId: s.schoolId }, include: { _count: { select: { classes: true } } }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { schoolId: s.schoolId, role: "TEACHER", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.academicYear.findMany({ where: { schoolId: s.schoolId }, orderBy: { startsOn: "desc" } }),
  ]);
  return { classes, subjects, teachers, years };
}

export async function adminClass(s: S, id: string) {
  const c = await db.class.findFirst({
    where: { id, schoolId: s.schoolId },
    include: {
      subject: true, teacher: { select: { name: true } }, academicYear: { select: { name: true } },
      enrollments: { include: { student: { select: { id: true, name: true, email: true, gradeLevel: true, active: true } } }, orderBy: { student: { name: "asc" } } },
    },
  });
  if (!c) notFound();
  const available = await db.user.findMany({
    where: { schoolId: s.schoolId, role: "STUDENT", active: true, enrollments: { none: { classId: c.id } } },
    select: { id: true, name: true, gradeLevel: true },
    orderBy: [{ gradeLevel: "asc" }, { name: "asc" }],
  });
  return { ...c, available };
}

// ---------------- Approvals ----------------

export async function pendingLessons(s: S) {
  return db.lesson.findMany({
    where: { schoolId: s.schoolId, status: "PENDING_APPROVAL" },
    include: { author: { select: { name: true } }, class: { select: { name: true, gradeLevel: true, subject: { select: { name: true } } } } },
    orderBy: { updatedAt: "asc" },
  });
}

export async function approvalLesson(s: S, id: string) {
  const l = await db.lesson.findFirst({
    where: { id, schoolId: s.schoolId },
    include: { author: { select: { name: true } }, class: { select: { name: true, gradeLevel: true, subject: { select: { name: true } } } } },
  });
  if (!l) notFound();
  return l;
}

export async function recentApprovalDecisions(s: S) {
  const logs = await db.auditLog.findMany({
    where: { schoolId: s.schoolId, action: { in: ["lesson.approve", "lesson.return"] } },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  const lessons = await db.lesson.findMany({ where: { schoolId: s.schoolId, id: { in: logs.map((l) => l.target ?? "") } }, select: { id: true, title: true } });
  return logs.map((l) => ({ ...l, title: lessons.find((x) => x.id === l.target)?.title ?? "Lesson" }));
}

// ---------------- Moderation ----------------

export async function schoolModeration(s: S, status: "OPEN" | "CLOSED") {
  const items = await db.moderationItem.findMany({
    where: { schoolId: s.schoolId, status: status === "OPEN" ? "OPEN" : { in: ["RESOLVED", "DISMISSED"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  // Context for held messages and flagged AI replies, always from this school.
  const msgIds = items.filter((i) => i.kind === "message" && i.sourceId).map((i) => i.sourceId!);
  const aiIds = items.filter((i) => i.kind === "ai_reply" && i.sourceId).map((i) => i.sourceId!);
  const resolverIds = items.map((i) => i.resolvedById).filter((x): x is string => Boolean(x));
  const [messages, ai, resolvers] = await Promise.all([
    db.message.findMany({ where: { id: { in: msgIds }, schoolId: s.schoolId }, include: { from: { select: { name: true, role: true } }, to: { select: { name: true, role: true } } } }),
    db.aiMessage.findMany({ where: { id: { in: aiIds }, schoolId: s.schoolId }, select: { id: true, content: true, role: true, createdAt: true } }),
    db.user.findMany({ where: { id: { in: resolverIds } }, select: { id: true, name: true } }),
  ]);
  return items.map((i) => ({
    ...i,
    message: i.kind === "message" ? messages.find((m) => m.id === i.sourceId) ?? null : null,
    ai: i.kind === "ai_reply" ? ai.find((m) => m.id === i.sourceId) ?? null : null,
    resolvedBy: resolvers.find((u) => u.id === i.resolvedById)?.name ?? null,
  }));
}

// ---------------- School ----------------

export async function schoolSettings(s: S) {
  return db.school.findUniqueOrThrow({ where: { id: s.schoolId }, include: { organization: true, academicYears: { orderBy: { startsOn: "desc" }, include: { _count: { select: { classes: true } } } } } });
}
