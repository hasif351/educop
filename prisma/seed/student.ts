import type { PrismaClient } from "@prisma/client";
import { DOMAIN_INFO, adapt, generateItem, replaySession, rng, type Answer, type Domain } from "../../src/lib/cognitive";

const DAY = 86_400_000;
/** A moment n days ago at the given hour, Gulf Standard Time (UTC+4). */
function daysAgo(n: number, hour: number, min = 0) {
  const d = new Date(Date.now() - n * DAY);
  d.setUTCHours(hour - 4, min, 0, 0);
  return d;
}

/** Same badge rules as src/lib/points.ts (which is server-only, so not importable here). */
function badgesFor(x: { total: number; practice: number; lessons: number; goals: number; streak: boolean }) {
  return [
    ...(x.lessons ? ["first_lesson"] : []), ...(x.total >= 100 ? ["points_100"] : []), ...(x.total >= 250 ? ["points_250"] : []),
    ...(x.practice >= 5 ? ["reasoning_5"] : []), ...(x.goals ? ["goal_done"] : []), ...(x.streak ? ["streak_5"] : []),
  ];
}

type Plan = { domain: Domain; ago: number; skill: number; ms: number };

/** Simulates a student answering a set: right with probability `skill`, so levels adapt like the real player. */
function playSet(domain: Domain, grade: number, seed: string, startLevel: number, skill: number, ms: number) {
  const r = rng(`${seed}:answers`);
  const answers: Answer[] = [];
  let state = { level: startLevel, run: 0 };
  for (let i = 0; i < (grade <= 2 ? 6 : 8); i++) {
    const item = generateItem(domain, grade, seed, i, state.level);
    const right = r() < skill;
    answers.push({ choice: right ? item.answerIndex : (item.answerIndex + 1) % 4, ms: Math.round(ms * (0.7 + r() * 0.6)) });
    state = adapt(state, right);
  }
  return replaySession(domain, grade, seed, startLevel, answers);
}

// Demo data for the student modules. Must be idempotent: it also runs against a
// database that was seeded before these modules existed (see seed/modules.ts).
export async function seedStudent(db: PrismaClient) {
  const layla = await db.user.findUnique({ where: { email: "layla@crescentbay.example" } });
  if (!layla?.schoolId) return;
  if (await db.cognitiveSession.count({ where: { studentId: layla.id } })) return;
  const schoolId = layla.schoolId;
  const handles = ["ethan", "aisha", "noah", "zara", "kenji"];
  const classmates = (await db.user.findMany({ where: { email: { in: handles.map((h) => `${h}@crescentbay.example`) }, schoolId } }))
    .sort((a, b) => a.email.localeCompare(b.email));

  // ---------- Reasoning practice: Layla grows over five weeks ----------
  const laylaPlan: Plan[] = [
    { domain: "patterns", ago: 33, skill: 0.5, ms: 14000 }, { domain: "patterns", ago: 24, skill: 0.6, ms: 12000 },
    { domain: "patterns", ago: 12, skill: 0.75, ms: 10000 }, { domain: "patterns", ago: 3, skill: 0.85, ms: 8000 },
    { domain: "memory", ago: 30, skill: 0.6, ms: 9000 }, { domain: "memory", ago: 16, skill: 0.65, ms: 8500 },
    { domain: "speed", ago: 27, skill: 0.8, ms: 6000 }, { domain: "speed", ago: 20, skill: 0.85, ms: 5200 },
    { domain: "speed", ago: 9, skill: 0.85, ms: 4200 }, { domain: "speed", ago: 2, skill: 0.9, ms: 3600 },
    { domain: "verbal", ago: 6, skill: 0.7, ms: 11000 },
  ];
  const otherPlans: Plan[][] = [
    [{ domain: "patterns", ago: 10, skill: 0.7, ms: 9000 }, { domain: "speed", ago: 4, skill: 0.8, ms: 5000 }],
    [{ domain: "verbal", ago: 14, skill: 0.8, ms: 9000 }, { domain: "verbal", ago: 5, skill: 0.85, ms: 8000 }, { domain: "memory", ago: 3, skill: 0.6, ms: 9000 }],
    [{ domain: "spatial", ago: 8, skill: 0.6, ms: 12000 }],
    [{ domain: "patterns", ago: 12, skill: 0.5, ms: 13000 }, { domain: "patterns", ago: 2, skill: 0.65, ms: 11000 }],
    [{ domain: "memory", ago: 7, skill: 0.75, ms: 7000 }, { domain: "spatial", ago: 6, skill: 0.7, ms: 10000 }],
  ];
  const points = new Map<string, { points: number; reason: string; key: string; createdAt: Date }[]>();
  const give = (studentId: string, p: number, reason: string, key: string, createdAt: Date) => {
    points.set(studentId, [...(points.get(studentId) ?? []), { points: p, reason, key, createdAt }]);
  };

  const students = [layla, ...classmates];
  const plans = [laylaPlan, ...otherPlans];
  for (let si = 0; si < students.length; si++) {
    const st = students[si];
    const grade = st.gradeLevel ?? 5;
    const levels: Partial<Record<Domain, number>> = {};
    for (const [pi, p] of plans[si].sort((a, b) => b.ago - a.ago).entries()) {
      const seed = `seed-${st.email}-${pi}`;
      const start = levels[p.domain] ?? 1;
      const r = playSet(p.domain, grade, seed, start, p.skill, p.ms);
      levels[p.domain] = r.endLevel;
      const completedAt = daysAgo(p.ago, 16, 30);
      const s = await db.cognitiveSession.create({
        data: {
          schoolId, studentId: st.id, domain: p.domain, level: r.endLevel, correct: r.correct, total: r.total, avgMs: r.avgMs,
          items: { seed, startLevel: start, gradeLevel: grade, items: r.items }, startedAt: new Date(completedAt.getTime() - 6 * 60_000), completedAt,
        },
      });
      give(st.id, 10, `Finished a ${DOMAIN_INFO[p.domain].label.toLowerCase()} practice set`, `practice:${s.id}`, completedAt);
    }
  }

  // ---------- Growth check-ins (private unless shared) ----------
  type C = { ago: number; mood: number; feelings: string[]; note?: string; shared?: boolean };
  const laylaCheckins: C[] = [
    { ago: 12, mood: 3, feelings: ["Tired"] }, { ago: 10, mood: 4, feelings: ["Curious"] },
    { ago: 8, mood: 2, feelings: ["Worried"], note: "Fractions quiz tomorrow.", shared: true },
    { ago: 6, mood: 4, feelings: ["Calm", "Curious"] }, { ago: 4, mood: 4, feelings: ["Proud"], note: "I helped Zara with fractions." },
    { ago: 3, mood: 5, feelings: ["Excited"], shared: true }, { ago: 2, mood: 4, feelings: ["Calm"] }, { ago: 1, mood: 4, feelings: ["Curious", "Proud"] },
  ];
  const otherCheckins: C[][] = [
    [{ ago: 5, mood: 4, feelings: ["Calm"] }, { ago: 2, mood: 3, feelings: ["Tired"] }],
    [{ ago: 6, mood: 5, feelings: ["Excited"], shared: true }, { ago: 1, mood: 4, feelings: ["Proud"] }],
    [{ ago: 4, mood: 2, feelings: ["Frustrated"], note: "Group project is hard.", shared: true }, { ago: 1, mood: 3, feelings: ["Not sure"] }],
    [{ ago: 3, mood: 3, feelings: ["Worried"] }, { ago: 2, mood: 4, feelings: ["Calm"] }],
    [{ ago: 7, mood: 4, feelings: ["Curious"] }, { ago: 2, mood: 5, feelings: ["Calm", "Proud"], shared: true }],
  ];
  const checkinPlans = [laylaCheckins, ...otherCheckins];
  for (let si = 0; si < students.length; si++) {
    const st = students[si];
    for (const c of checkinPlans[si]) {
      const createdAt = daysAgo(c.ago, 8, 10);
      await db.selCheckin.create({ data: { schoolId, studentId: st.id, mood: c.mood, feelings: c.feelings, note: c.note ?? "", shared: c.shared ?? false, createdAt } });
      give(st.id, 5, "Daily check-in", `checkin:${new Date(createdAt.getTime() + 4 * 3600_000).toISOString().slice(0, 10)}`, createdAt);
    }
  }
  const reflAt = daysAgo(5, 13);
  await db.selCheckin.create({
    data: {
      schoolId, studentId: layla.id, mood: 0, feelings: [], scenario: "group-project", shared: true, createdAt: reflAt,
      note: "Picked: Ask each person what they enjoy and split the jobs fairly",
      response: "I would ask Noah and Aisha what they like doing. One could paint the base and the other could paint the clouds.",
    },
  });
  give(layla.id, 5, "Scenario reflection", `reflect:${new Date(reflAt.getTime() + 4 * 3600_000).toISOString().slice(0, 10)}`, reflAt);

  // ---------- Goals ----------
  await db.selGoal.create({ data: { schoolId, studentId: layla.id, text: "Finish my reading log every evening", createdAt: daysAgo(14, 17) } });
  const done = await db.selGoal.create({ data: { schoolId, studentId: layla.id, text: "Ask one question in class each day", createdAt: daysAgo(15, 17), doneAt: daysAgo(5, 15) } });
  give(layla.id, 15, "Completed a personal goal", `goal:${done.id}`, daysAgo(5, 15));
  if (classmates[1]) await db.selGoal.create({ data: { schoolId, studentId: classmates[1].id, text: "Practise my times tables for 10 minutes", createdAt: daysAgo(6, 17) } });

  // ---------- Points for Layla's finished lesson (core seed) ----------
  const finished = await db.lessonProgress.findMany({ where: { studentId: layla.id, completedAt: { not: null } } });
  for (const lp of finished) give(layla.id, 10, "Finished a lesson", `lesson:${lp.lessonId}`, lp.completedAt!);
  // Check-ins on the last few days give Layla a running streak.
  give(layla.id, 20, "Learned on 5 days in a row", "badge:streak_5", daysAgo(1, 8, 15));

  for (const st of students) {
    const events = points.get(st.id) ?? [];
    await db.pointEvent.createMany({ data: events.map((e) => ({ schoolId, studentId: st.id, ...e })), skipDuplicates: true });
    const total = events.reduce((a, e) => a + e.points, 0);
    await db.user.update({ where: { id: st.id }, data: { points: { increment: total } } });
    const practice = await db.cognitiveSession.count({ where: { studentId: st.id, completedAt: { not: null } } });
    const badges = badgesFor({
      total: st.points + total, practice, lessons: st.id === layla.id ? finished.length : 0, goals: st.id === layla.id ? 1 : 0, streak: st.id === layla.id,
    });
    await db.studentBadge.createMany({ data: badges.map((badge) => ({ studentId: st.id, badge, earnedAt: daysAgo(2, 17) })), skipDuplicates: true });
  }

  // ---------- A short past chat with Nova ----------
  const chatAt = daysAgo(1, 17);
  await db.aiMessage.createMany({
    data: [
      { schoolId, userId: layla.id, role: "user", content: "How do I compare 1/4 and 1/7?", createdAt: chatAt },
      { schoolId, userId: layla.id, role: "assistant", model: "template", createdAt: new Date(chatAt.getTime() + 2000),
        content: "Hint 1: picture a strip cut into 2 equal parts with 1 part shaded. If you cut each part in half again, how many parts are there now, and how many are shaded? Want hint 2, or want to try first?" },
    ],
  });
}
