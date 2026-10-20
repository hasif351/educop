"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { award } from "@/lib/points";
import { checkStreakBadge } from "@/lib/gamify";
import { DOMAINS, DOMAIN_INFO, growthMessage, replaySession, startLevel } from "@/lib/cognitive";

const Start = z.enum(DOMAINS);

/** Opens a practice set. The seed stays on the server record so scoring can replay it. */
export async function startPractice(domain: string) {
  const s = await requireRole("STUDENT");
  const d = Start.parse(domain);
  const [user, last] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { gradeLevel: true } }),
    db.cognitiveSession.findFirst({ where: { schoolId: s.schoolId, studentId: s.userId, domain: d, completedAt: { not: null } }, orderBy: { completedAt: "desc" }, select: { level: true } }),
  ]);
  const seed = randomUUID();
  const level = startLevel(last);
  const session = await db.cognitiveSession.create({
    data: { schoolId: s.schoolId, studentId: s.userId, domain: d, level, items: { seed, startLevel: level, gradeLevel: user.gradeLevel } },
  });
  return { id: session.id, seed, level, gradeLevel: user.gradeLevel };
}

const Finish = z.object({
  sessionId: z.string().min(1).max(40),
  answers: z.array(z.object({ choice: z.number().int().min(0).max(3).nullable(), ms: z.number().min(0).max(3_600_000) })).min(1).max(8),
});
type Stored = { seed: string; startLevel: number; gradeLevel: number | null };

export type FinishResult = { error: string } | { correct: number; total: number; endLevel: number; startLevel: number; growth: string; points: number };

export async function finishPractice(input: z.infer<typeof Finish>): Promise<FinishResult> {
  const s = await requireRole("STUDENT");
  const parsed = Finish.safeParse(input);
  if (!parsed.success) return { error: "Answer at least one puzzle before finishing." };
  const { sessionId, answers } = parsed.data;
  const session = await db.cognitiveSession.findFirst({ where: { id: sessionId, schoolId: s.schoolId, studentId: s.userId, completedAt: null } });
  if (!session) return { error: "This practice set isn't open any more." };
  const domain = Start.parse(session.domain);
  const stored = session.items as Stored;

  const r = replaySession(domain, stored.gradeLevel, stored.seed, stored.startLevel, answers);
  await db.cognitiveSession.update({
    where: { id: session.id },
    data: { items: { ...stored, items: r.items }, correct: r.correct, total: r.total, avgMs: r.avgMs, level: r.endLevel, completedAt: new Date() },
  });
  const done = await db.cognitiveSession.findMany({
    where: { schoolId: s.schoolId, studentId: s.userId, completedAt: { not: null } },
    orderBy: { completedAt: "asc" }, select: { domain: true, correct: true, total: true, avgMs: true, level: true },
  });
  const points = 10;
  await award(s.userId, s.schoolId, points, `Finished a ${DOMAIN_INFO[domain].label.toLowerCase()} practice set`, `practice:${session.id}`, done.length >= 5 ? "reasoning_5" : undefined);
  await checkStreakBadge(s.userId, s.schoolId);
  await audit(s, "practice.complete", session.id, { domain, total: r.total });
  revalidatePath("/student/skills");
  revalidatePath("/student");
  return {
    correct: r.correct, total: r.total, endLevel: r.endLevel, startLevel: stored.startLevel, points,
    growth: growthMessage(domain, done.filter((x) => x.domain === domain)).text,
  };
}
