import "server-only";
import { db } from "./db";

// Gamification: points for effort (finishing lessons, practice, goals), never for
// ranking students against each other. Each award has a unique key so repeats are ignored.

export const BADGES: Record<string, { label: string; description: string; threshold?: number }> = {
  first_lesson: { label: "First steps", description: "Finished your first lesson" },
  points_100: { label: "Century", description: "Earned 100 points", threshold: 100 },
  points_250: { label: "Rising star", description: "Earned 250 points", threshold: 250 },
  reasoning_5: { label: "Puzzle solver", description: "Finished 5 reasoning practice sets" },
  goal_done: { label: "Goal getter", description: "Completed a personal goal" },
  streak_5: { label: "Five-day streak", description: "Learned on 5 days in a row" },
};

export async function award(studentId: string, schoolId: string, points: number, reason: string, key: string, badge?: keyof typeof BADGES) {
  const created = await db.pointEvent.createMany({ data: [{ studentId, schoolId, points, reason, key }], skipDuplicates: true });
  if (created.count === 0) return false;
  const user = await db.user.update({ where: { id: studentId }, data: { points: { increment: points } }, select: { points: true } });
  const earned: string[] = badge ? [badge] : [];
  for (const [id, b] of Object.entries(BADGES)) if (b.threshold && user.points >= b.threshold) earned.push(id);
  if (earned.length) await db.studentBadge.createMany({ data: earned.map((b) => ({ studentId, badge: b })), skipDuplicates: true });
  return true;
}
