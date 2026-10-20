import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";

// Platform-admin reads (SUPER_ADMIN). Cross-school, but totals only: these
// queries never return student work, messages or AI conversation content.

const DAY = 86_400_000;

export async function platformTotals() {
  const since = new Date(Date.now() - 7 * DAY);
  const [orgs, schools, roleCounts, active7, ai7, drafts7, openMod, aiFlagged7] = await Promise.all([
    db.organization.count(),
    db.school.findMany({ include: { organization: { select: { name: true } } }, orderBy: { name: "asc" } }),
    db.user.groupBy({ by: ["schoolId", "role"], where: { active: true, schoolId: { not: null } }, _count: true }),
    db.user.groupBy({ by: ["schoolId"], where: { lastLoginAt: { gte: since }, schoolId: { not: null } }, _count: true }),
    db.aiMessage.groupBy({ by: ["schoolId"], where: { createdAt: { gte: since }, role: "user" }, _count: true }),
    db.aiDraft.groupBy({ by: ["schoolId"], where: { createdAt: { gte: since } }, _count: true }),
    db.moderationItem.groupBy({ by: ["schoolId"], where: { status: "OPEN" }, _count: true }),
    db.aiMessage.count({ where: { createdAt: { gte: since }, flagged: true } }),
  ]);
  const pick = (rows: { schoolId: string | null; _count: number }[], id: string) => rows.find((r) => r.schoolId === id)?._count ?? 0;
  const role = (id: string, r: string) => roleCounts.find((c) => c.schoolId === id && c.role === r)?._count ?? 0;
  const bySchool = schools.map((s) => ({
    id: s.id, name: s.name, org: s.organization.name, active: s.active, plan: s.plan, seatLimit: s.seatLimit,
    students: role(s.id, "STUDENT"), teachers: role(s.id, "TEACHER"), parents: role(s.id, "PARENT"),
    active7: pick(active7, s.id), aiRequests7: pick(ai7, s.id), aiDrafts7: pick(drafts7, s.id), openModeration: pick(openMod, s.id),
  }));
  const sum = (k: keyof (typeof bySchool)[number]) => bySchool.reduce((n, r) => n + (r[k] as number), 0);
  return {
    orgs, schools: bySchool.length, activeSchools: bySchool.filter((s) => s.active).length, bySchool,
    active7: sum("active7"), aiRequests7: sum("aiRequests7"), aiDrafts7: sum("aiDrafts7"), aiFlagged7,
    openModeration: openMod.reduce((n, r) => n + r._count, 0),
  };
}

export async function platformSchools() {
  const [orgs, schools, students] = await Promise.all([
    db.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.school.findMany({ include: { organization: { select: { name: true } }, _count: { select: { users: true, classes: true } } }, orderBy: [{ organization: { name: "asc" } }, { name: "asc" }] }),
    db.user.groupBy({ by: ["schoolId"], where: { role: "STUDENT", active: true }, _count: true }),
  ]);
  return { orgs, schools: schools.map((s) => ({ ...s, students: students.find((x) => x.schoolId === s.id)?._count ?? 0 })) };
}

export type UsageRow = { schoolId: string; bucket: Date; tutorTurns: number; tutorTokens: number; flagged: number; drafts: number; draftTokens: number; accepted: number };

/** AI usage per school per day or ISO week (Gulf time), from AiMessage and AiDraft. */
export async function aiUsage(period: "day" | "week") {
  const span = period === "day" ? 14 : 8 * 7;
  const since = new Date(Date.now() - span * DAY);
  const unit = Prisma.raw(period === "day" ? "'day'" : "'week'");
  const [msgs, drafts, schools] = await Promise.all([
    db.$queryRaw<{ schoolId: string; bucket: Date; turns: bigint; tokens: bigint; flagged: bigint }[]>`
      SELECT "schoolId", date_trunc(${unit}, "createdAt" AT TIME ZONE 'Asia/Dubai') AS bucket,
             COUNT(*) FILTER (WHERE role = 'user') AS turns,
             COALESCE(SUM("inputTokens" + "outputTokens"), 0) AS tokens,
             COUNT(*) FILTER (WHERE flagged) AS flagged
      FROM "AiMessage" WHERE "createdAt" >= ${since} GROUP BY 1, 2`,
    db.$queryRaw<{ schoolId: string; bucket: Date; drafts: bigint; tokens: bigint; accepted: bigint }[]>`
      SELECT "schoolId", date_trunc(${unit}, "createdAt" AT TIME ZONE 'Asia/Dubai') AS bucket,
             COUNT(*) AS drafts, COALESCE(SUM("inputTokens" + "outputTokens"), 0) AS tokens,
             COUNT(*) FILTER (WHERE status = 'ACCEPTED') AS accepted
      FROM "AiDraft" WHERE "createdAt" >= ${since} GROUP BY 1, 2`,
    db.school.findMany({ select: { id: true, name: true, aiEnabled: true }, orderBy: { name: "asc" } }),
  ]);
  const rows = new Map<string, UsageRow>();
  const row = (schoolId: string, bucket: Date) => {
    const k = `${schoolId}|${bucket.toISOString()}`;
    if (!rows.has(k)) rows.set(k, { schoolId, bucket, tutorTurns: 0, tutorTokens: 0, flagged: 0, drafts: 0, draftTokens: 0, accepted: 0 });
    return rows.get(k)!;
  };
  for (const m of msgs) Object.assign(row(m.schoolId, m.bucket), { tutorTurns: Number(m.turns), tutorTokens: Number(m.tokens), flagged: Number(m.flagged) });
  for (const d of drafts) Object.assign(row(d.schoolId, d.bucket), { drafts: Number(d.drafts), draftTokens: Number(d.tokens), accepted: Number(d.accepted) });
  const list = [...rows.values()].sort((a, b) => b.bucket.getTime() - a.bucket.getTime() || a.schoolId.localeCompare(b.schoolId));
  return { rows: list, schools, since };
}

export async function platformModeration(status: "OPEN" | "CLOSED") {
  const [items, schools] = await Promise.all([
    db.moderationItem.findMany({
      where: { status: status === "OPEN" ? "OPEN" : { in: ["RESOLVED", "DISMISSED"] } },
      select: { id: true, schoolId: true, kind: true, summary: true, status: true, createdAt: true, resolvedAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.school.findMany({ select: { id: true, name: true } }),
  ]);
  return items.map((i) => ({ ...i, school: schools.find((s) => s.id === i.schoolId)?.name ?? "Platform" }));
}

export const AUDIT_PAGE = 50;

export async function platformAudit(f: { schoolId?: string; action?: string; from?: Date; to?: Date; page: number }) {
  const where: Prisma.AuditLogWhereInput = {
    ...(f.schoolId === "platform" ? { schoolId: null } : f.schoolId ? { schoolId: f.schoolId } : {}),
    ...(f.action ? { action: { startsWith: f.action } } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } } : {}),
  };
  const [rows, total, schools, actions] = await Promise.all([
    db.auditLog.findMany({
      where, include: { actor: { select: { name: true, role: true } }, school: { select: { name: true } } },
      orderBy: { createdAt: "desc" }, skip: (f.page - 1) * AUDIT_PAGE, take: AUDIT_PAGE,
    }),
    db.auditLog.count({ where }),
    db.school.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" }, take: 200 }),
  ]);
  // Students appear as "A student": platform admins don't need children's names here.
  return { rows: rows.map((r) => ({ ...r, actorLabel: !r.actor ? "System" : r.actor.role === "STUDENT" ? "A student" : r.actor.name })), total, schools, actions: actions.map((a) => a.action) };
}
