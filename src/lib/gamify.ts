import "server-only";
import { db } from "./db";
import { award } from "./points";
import { learningStreak } from "./streak";

const DAY = 86_400_000;

/** Moments with learning activity: lesson progress, growth check-ins and reasoning practice. */
export async function learningDates(studentId: string, schoolId: string, days = 60) {
  const since = new Date(Date.now() - days * DAY);
  const [lessons, checkins, practice] = await Promise.all([
    db.lessonProgress.findMany({ where: { studentId, lesson: { schoolId }, updatedAt: { gte: since } }, select: { updatedAt: true } }),
    db.selCheckin.findMany({ where: { studentId, schoolId, createdAt: { gte: since } }, select: { createdAt: true } }),
    db.cognitiveSession.findMany({ where: { studentId, schoolId, completedAt: { gte: since } }, select: { completedAt: true } }),
  ]);
  return [...lessons.map((l) => l.updatedAt), ...checkins.map((c) => c.createdAt), ...practice.map((p) => p.completedAt!)];
}

/** Awards the five-day streak badge (once) after any learning activity. */
export async function checkStreakBadge(studentId: string, schoolId: string) {
  const { current } = learningStreak(await learningDates(studentId, schoolId, 14));
  if (current >= 5) await award(studentId, schoolId, 20, "Learned on 5 days in a row", "badge:streak_5", "streak_5");
}
