import type { PrismaClient } from "@prisma/client";
import { newRoomName } from "../../src/lib/live-utils";

// Demo data for the comms modules. Must be idempotent: it also runs against a
// database that was seeded before these modules existed (see seed/modules.ts).
// Every part checks for its own rows first, and finds people by demo email.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** A time today (+/- days) in Gulf Standard Time. */
const at = (dayOffset: number, hour: number, min = 0) => {
  const d = new Date(Date.now() + dayOffset * DAY);
  d.setUTCHours(hour - 4, min, 0, 0);
  return d;
};
const ago = (ms: number) => new Date(Date.now() - ms);

export async function seedComms(db: PrismaClient) {
  const school = await db.school.findUnique({ where: { slug: "crescent-bay" } });
  if (!school) return;
  const byEmail = async (email: string) => db.user.findUnique({ where: { email } });
  const [layla, adam, sara, rania, admin, platform, omar] = await Promise.all(
    ["layla@crescentbay.example", "adam@crescentbay.example", "sara.mitchell@crescentbay.example", "rania.hassan@example.com",
      "admin@crescentbay.example", "platform@educop.example", "omar.farouk@palmgrove.example"].map(byEmail),
  );
  const math5b = await db.class.findFirst({ where: { schoolId: school.id, name: "5B Mathematics" } });
  if (!layla || !sara || !rania || !math5b) return;

  // ---------- Notifications (per user, only if they have none) ----------
  type N = { kind: string; title: string; body: string; href?: string; age: number; read?: boolean };
  const seedFor = async (user: { id: string; schoolId: string | null } | null, list: N[]) => {
    if (!user || (await db.notification.count({ where: { userId: user.id } })) > 0) return;
    await db.notification.createMany({
      data: list.map((n) => ({ userId: user.id, schoolId: user.schoolId, kind: n.kind, title: n.title, body: n.body, href: n.href, createdAt: ago(n.age), readAt: n.read ? ago(n.age - MIN) : null })),
    });
  };
  const announcement: N = { kind: "system", title: "School announcement", body: "Parent–teacher conferences open for booking, 3–5 Nov", age: DAY + 2 * HOUR };
  await seedFor(layla, [
    { kind: "class", title: "Live class later today", body: "5B Mathematics · Equivalent fractions with Ms. Mitchell", href: "/student/live", age: 8 * MIN },
    { kind: "assign", title: "Assignment due soon", body: "Equivalent fractions check-in · 5B Mathematics", href: "/student/assignments", age: HOUR },
    { kind: "ai", title: "New recommendation reviewed by your teacher", body: "\"Fraction strips warm-up\" was added to your plan", href: "/student", age: 2 * HOUR },
    { kind: "grade", title: "Feedback posted", body: "Comparing fractions quiz was marked with comments", href: "/student/assignments", age: DAY, read: true },
    announcement,
  ]);
  await seedFor(sara, [
    { kind: "assign", title: "Submissions waiting for marking", body: "5B Equivalent fractions check-in", href: "/teacher", age: 35 * MIN },
    { kind: "message", title: "New message from Rania Hassan", body: "How can we help Layla practise fractions at home?", href: `/teacher/messages?with=${rania.id}&student=${layla.id}`, age: 3 * HOUR },
    { kind: "ai", title: "Recommendations need your review", body: "Class 5B · Fractions objective G5-NUM-FR-04", href: "/teacher", age: 3 * HOUR },
    announcement,
  ]);
  await seedFor(rania, [
    { kind: "message", title: "New message from Sara Mitchell", body: "Fraction strips are a great way to practise at home.", href: `/parent/messages?with=${sara.id}&student=${layla.id}`, age: 40 * MIN },
    { kind: "assign", title: "Assignment due soon", body: "Layla Hassan · Equivalent fractions check-in", href: "/parent", age: HOUR },
    { kind: "grade", title: "Feedback posted", body: "Layla Hassan · Comparing fractions quiz", href: "/parent", age: DAY, read: true },
    announcement,
  ]);
  await seedFor(admin, [
    { kind: "system", title: "Items awaiting content approval", body: "Grade 5 teacher resources", href: "/admin", age: 2 * HOUR },
    announcement,
  ]);
  await seedFor(omar, [{ kind: "system", title: "Welcome to Educop", body: "Your classes and lessons are ready in the dashboard.", href: "/teacher", age: 2 * DAY }]);
  await seedFor(platform, [
    { kind: "system", title: "Security: 2 failed sign-ins blocked", body: "Palm Grove Academy admin account · rate limit applied", href: "/platform", age: 4 * HOUR },
    { kind: "system", title: "Pilot schools active", body: "Crescent Bay International School and Palm Grove Academy", href: "/platform", age: DAY + HOUR, read: true },
  ]);

  // ---------- Parent–teacher thread about Layla ----------
  const existing = await db.message.count({ where: { studentId: layla.id, OR: [{ fromId: rania.id }, { toId: rania.id }] } });
  if (existing === 0) {
    const thread = [
      { from: sara, to: rania, body: "Hello Rania, a quick update on Layla: she explained equivalent fractions really clearly in class this week, using fraction strips to show 1/2 = 2/4.", age: 26 * HOUR, read: true },
      { from: rania, to: sara, body: "Hi Ms. Mitchell, thank you for the update. How can we help Layla practise fractions at home?", age: 3 * HOUR, read: true },
      { from: sara, to: rania, body: "Fraction strips are a great way to practise at home. Folding paper strips into halves, quarters and eighths works well, and the practice set on Educop has hints.", age: 40 * MIN, read: false },
    ];
    for (const m of thread) {
      await db.message.create({ data: { schoolId: school.id, fromId: m.from.id, toId: m.to.id, studentId: layla.id, body: m.body, createdAt: ago(m.age), readAt: m.read ? ago(m.age - 10 * MIN) : null } });
    }
  }

  // ---------- Consents for Layla and Adam (set by Rania) ----------
  const consents: [typeof layla | null, Record<string, boolean>][] = [
    [layla, { ai_tutor: true, sel_share_teacher: true, analytics: false, photo_media: true }],
    [adam, { ai_tutor: false, sel_share_teacher: false, analytics: false, photo_media: true }],
  ];
  for (const [child, set] of consents) {
    if (!child || (await db.consent.count({ where: { userId: child.id } })) > 0) continue;
    await db.consent.createMany({ data: Object.entries(set).map(([key, granted]) => ({ userId: child.id, key, granted })) });
    await db.auditLog.createMany({
      data: Object.entries(set).map(([key, granted]) => ({ schoolId: school.id, actorId: rania.id, action: "consent.update", target: child.id, meta: { key, granted }, createdAt: new Date("2026-09-02T08:12:00+04:00") })),
    });
  }

  // ---------- Live sessions for 5B Mathematics ----------
  if ((await db.liveSession.count({ where: { classId: math5b.id } })) === 0) {
    // Later today (at least 30 minutes from now, so it's still "scheduled" in the demo).
    const startsAt = new Date(Math.max(at(0, 10).getTime(), Date.now() + 30 * MIN));
    await db.liveSession.create({ data: { schoolId: school.id, classId: math5b.id, teacherId: sara.id, title: "Equivalent fractions", startsAt, durationMin: 40, roomName: newRoomName() } });

    const start = at(-1, 10);
    const ended = await db.liveSession.create({
      data: { schoolId: school.id, classId: math5b.id, teacherId: sara.id, title: "Comparing fractions", startsAt: start, durationMin: 40, status: "ENDED", roomName: newRoomName(), startedAt: start, endedAt: new Date(start.getTime() + 41 * MIN) },
    });
    const students = await db.enrollment.findMany({ where: { classId: math5b.id }, select: { student: { select: { id: true, email: true } } }, orderBy: { student: { name: "asc" } } });
    // Two students missed it; everyone else stayed most of the lesson.
    const attended = students.filter((e) => !["aisha@crescentbay.example", "sofia@crescentbay.example"].includes(e.student.email));
    await db.liveAttendance.createMany({
      data: attended.map((e, i) => ({ sessionId: ended.id, userId: e.student.id, joinedAt: new Date(start.getTime() + (1 + i) * MIN), lastSeenAt: new Date(start.getTime() + (38 + (i % 3)) * MIN) })),
    });
    const votes = Object.fromEntries(attended.map((e, i) => [e.student.id, i === 2 ? 2 : i === 4 ? 1 : 0]));
    await db.livePoll.create({ data: { sessionId: ended.id, question: "Which is bigger: 3/4 or 5/8?", options: ["3/4", "5/8", "They are equal"], open: false, votes, createdAt: new Date(start.getTime() + 15 * MIN) } });
    const by = (email: string) => students.find((e) => e.student.email === email)?.student.id;
    const chat = [
      [sara.id, "Welcome everyone! We start in one minute.", 1],
      [by("noah@crescentbay.example"), "Good morning!", 2],
      [by("kenji@crescentbay.example"), "Is 1/3 bigger than 1/5 because the pieces are bigger?", 12],
      [sara.id, "Exactly, Kenji. Fewer pieces means bigger pieces.", 13],
    ] as const;
    await db.liveChat.createMany({
      data: chat.filter((c) => c[0]).map(([userId, body, m]) => ({ sessionId: ended.id, userId: userId!, body, createdAt: new Date(start.getTime() + m * MIN) })),
    });
  }
}
