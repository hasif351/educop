import "server-only";
import { notFound } from "next/navigation";
import { db } from "./db";
import { dayBounds } from "./data";
import { DOMAINS, DOMAIN_INFO, growthMessage, type Domain } from "./cognitive";
import { MIN_GROUP, REFLECTION_ONLY, aggregateCheckins, readHabits } from "./sel";
import { learningDates } from "./gamify";
import { learningStreak } from "./streak";
import { NOVA_DAILY_LIMIT } from "./nova";
import type { SessionPayload } from "./session";

// Reads for the student modules (reasoning skills, my growth, for you, study
// buddy) plus two class-level summaries for teachers. Same rules as data.ts:
// every query is scoped by schoolId and by the caller's relationship.

type S = SessionPayload & { schoolId: string };
const DAY = 86_400_000;

// ---------------- Student: reasoning skills ----------------

export async function skillsOverview(s: S) {
  const sessions = await db.cognitiveSession.findMany({
    where: { schoolId: s.schoolId, studentId: s.userId, completedAt: { not: null } },
    select: { id: true, domain: true, correct: true, total: true, avgMs: true, level: true, completedAt: true },
    orderBy: { completedAt: "asc" },
  });
  const byDomain = DOMAINS.map((domain) => {
    const list = sessions.filter((x) => x.domain === domain);
    return {
      domain, info: DOMAIN_INFO[domain], count: list.length, level: list.at(-1)?.level ?? 1,
      lastAt: list.at(-1)?.completedAt ?? null,
      growth: growthMessage(domain, list),
      history: list.slice(-8).map((x) => ({ id: x.id, at: x.completedAt!, pct: x.total ? Math.round((x.correct / x.total) * 100) : 0, level: x.level })),
    };
  });
  return { byDomain, completed: sessions.length };
}

export async function lastPractice(s: S, domain: Domain) {
  return db.cognitiveSession.findFirst({
    where: { schoolId: s.schoolId, studentId: s.userId, domain, completedAt: { not: null } },
    orderBy: { completedAt: "desc" }, select: { level: true, completedAt: true },
  });
}

// ---------------- Student: my growth ----------------

export async function growthData(s: S) {
  const since = new Date(Date.now() - 30 * DAY);
  const { start } = dayBounds();
  const [user, checkins, reflections, goals] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { prefs: true } }),
    db.selCheckin.findMany({ where: { schoolId: s.schoolId, studentId: s.userId, mood: { gte: 1 }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" } }),
    db.selCheckin.findMany({ where: { schoolId: s.schoolId, studentId: s.userId, scenario: { not: null } }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.selGoal.findMany({ where: { schoolId: s.schoolId, studentId: s.userId }, orderBy: [{ doneAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], take: 20 }),
  ]);
  return {
    checkins, reflections, goals, habits: readHabits(user.prefs),
    today: checkins.find((c) => c.createdAt >= start) ?? null,
  };
}

// ---------------- Student: for you ----------------

export async function forYouData(s: S) {
  const [recs, user, badges, events, dates] = await Promise.all([
    db.recommendation.findMany({ where: { schoolId: s.schoolId, studentId: s.userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } }),
    db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { points: true } }),
    db.studentBadge.findMany({ where: { studentId: s.userId }, orderBy: { earnedAt: "asc" } }),
    db.pointEvent.findMany({ where: { schoolId: s.schoolId, studentId: s.userId }, orderBy: { createdAt: "desc" }, take: 8 }),
    learningDates(s.userId, s.schoolId, 30),
  ]);
  return { recs, points: user.points, badges, events, streak: learningStreak(dates) };
}

/** Small summary for the dashboard card. */
export async function progressSummary(s: S) {
  const [user, badges, dates] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { points: true } }),
    db.studentBadge.findMany({ where: { studentId: s.userId }, select: { badge: true }, orderBy: { earnedAt: "desc" } }),
    learningDates(s.userId, s.schoolId, 30),
  ]);
  return { points: user.points, badges: badges.map((b) => b.badge), streak: learningStreak(dates).current };
}

// ---------------- Student: study buddy ----------------

/** Whether Nova may be used: the school turned AI on and no parent turned the tutor off. */
export async function novaAccess(s: S) {
  const [school, consent] = await Promise.all([
    db.school.findUniqueOrThrow({ where: { id: s.schoolId }, select: { aiEnabled: true } }),
    db.consent.findUnique({ where: { userId_key: { userId: s.userId, key: "ai_tutor" } } }),
  ]);
  if (!school.aiEnabled) return { allowed: false as const, reason: "school" as const };
  if (consent && !consent.granted) return { allowed: false as const, reason: "consent" as const };
  return { allowed: true as const };
}

export async function buddyData(s: S) {
  const { start } = dayBounds();
  const [access, messages, usedToday] = await Promise.all([
    novaAccess(s),
    db.aiMessage.findMany({ where: { schoolId: s.schoolId, userId: s.userId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, role: true, content: true, flagged: true, model: true, createdAt: true } }),
    db.aiMessage.count({ where: { schoolId: s.schoolId, userId: s.userId, role: "user", createdAt: { gte: start } } }),
  ]);
  return { access, messages: messages.reverse(), remaining: Math.max(0, NOVA_DAILY_LIMIT - usedToday) };
}

// ---------------- Teacher: class summaries ----------------

async function taughtClass(s: S, classId: string) {
  const cls = await db.class.findFirst({
    where: { id: classId, schoolId: s.schoolId, teacherId: s.userId },
    select: { id: true, name: true, enrollments: { select: { studentId: true } } },
  });
  if (!cls) notFound();
  return { ...cls, studentIds: cls.enrollments.map((e) => e.studentId) };
}

/**
 * Growth (SEL) summary for a class the teacher teaches. The mood/feelings
 * aggregate is anonymous and null when fewer than MIN_GROUP students checked
 * in. Individual entries are only the check-ins and reflections students
 * chose to share.
 */
export async function classSelSummary(s: S, classId: string, days = 14) {
  const cls = await taughtClass(s, classId);
  const since = new Date(Date.now() - days * DAY);
  const rows = await db.selCheckin.findMany({
    where: { schoolId: s.schoolId, studentId: { in: cls.studentIds }, createdAt: { gte: since } },
    select: { id: true, studentId: true, mood: true, feelings: true, note: true, scenario: true, response: true, shared: true, createdAt: true, student: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const shared = rows.filter((r) => r.shared).map((r) => ({
    id: r.id, studentId: r.studentId, studentName: r.student.name, createdAt: r.createdAt,
    mood: r.mood === REFLECTION_ONLY ? null : r.mood, feelings: r.feelings, note: r.note, scenario: r.scenario, response: r.response,
  }));
  return { classId: cls.id, className: cls.name, days, minGroup: MIN_GROUP, classSize: cls.studentIds.length, aggregate: aggregateCheckins(rows), shared };
}

/**
 * Reasoning-practice summary for a class the teacher teaches. Per domain it
 * gives participation and, for groups of MIN_GROUP or more students, the
 * class's share of puzzles solved. Per student it gives participation only
 * (sets done, last practised): no scores, levels or ranking.
 */
export async function classSkillsSummary(s: S, classId: string, days = 30) {
  const cls = await taughtClass(s, classId);
  const since = new Date(Date.now() - days * DAY);
  const sessions = await db.cognitiveSession.findMany({
    where: { schoolId: s.schoolId, studentId: { in: cls.studentIds }, completedAt: { gte: since } },
    select: { studentId: true, domain: true, correct: true, total: true, completedAt: true },
  });
  const domains = DOMAINS.map((domain) => {
    const list = sessions.filter((x) => x.domain === domain);
    const students = new Set(list.map((x) => x.studentId)).size;
    const total = list.reduce((a, x) => a + x.total, 0);
    return {
      domain, label: DOMAIN_INFO[domain].label, sets: list.length, students,
      solvedPct: students >= MIN_GROUP && total ? Math.round((list.reduce((a, x) => a + x.correct, 0) / total) * 100) : null,
    };
  });
  const students = await db.user.findMany({ where: { id: { in: cls.studentIds }, schoolId: s.schoolId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const participation = students.map((st) => {
    const mine = sessions.filter((x) => x.studentId === st.id);
    return { studentId: st.id, name: st.name, sets: mine.length, lastAt: mine.reduce<Date | null>((a, x) => (!a || x.completedAt! > a ? x.completedAt : a), null) };
  });
  return { classId: cls.id, className: cls.name, days, minGroup: MIN_GROUP, domains, participation };
}
