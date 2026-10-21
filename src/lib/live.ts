import "server-only";
import { db } from "./db";
import { isPresent, myVote, shortName, tallyPoll } from "./live-utils";
import { moderate, moderationSummary } from "./moderate";
import type { SessionPayload } from "./session";

// Virtual classroom data access. A teacher sees sessions they host; a student
// sees sessions for classes they're enrolled in. Both scoped to their school.

type S = SessionPayload & { schoolId: string };

const forTeacher = (s: S) => ({ schoolId: s.schoolId, teacherId: s.userId });
async function enrolledClassIds(s: S) {
  const rows = await db.enrollment.findMany({ where: { studentId: s.userId, class: { schoolId: s.schoolId } }, select: { classId: true } });
  return rows.map((r) => r.classId);
}

async function classNames(ids: string[], schoolId: string) {
  const cs = await db.class.findMany({ where: { id: { in: ids }, schoolId }, select: { id: true, name: true, _count: { select: { enrollments: true } } } });
  return new Map(cs.map((c) => [c.id, c]));
}

export async function teacherLiveSessions(s: S) {
  const sessions = await db.liveSession.findMany({ where: forTeacher(s), include: { _count: { select: { attendance: true } } }, orderBy: { startsAt: "asc" } });
  const classes = await classNames([...new Set(sessions.map((x) => x.classId))], s.schoolId);
  return sessions.map((x) => ({ ...x, cls: classes.get(x.classId) }));
}

export async function studentLiveSessions(s: S) {
  const ids = await enrolledClassIds(s);
  const sessions = await db.liveSession.findMany({
    where: { schoolId: s.schoolId, classId: { in: ids } },
    include: { teacher: { select: { name: true } }, attendance: { where: { userId: s.userId }, select: { joinedAt: true } } },
    orderBy: { startsAt: "asc" },
  });
  const classes = await classNames(ids, s.schoolId);
  return sessions.map((x) => ({ ...x, cls: classes.get(x.classId) }));
}

/** The session if the caller may see it (teacher hosts it / student is enrolled), else null. */
export async function liveSessionFor(s: S, id: string) {
  const where = s.role === "TEACHER"
    ? { id, ...forTeacher(s) }
    : s.role === "STUDENT" ? { id, schoolId: s.schoolId, classId: { in: await enrolledClassIds(s) } } : null;
  if (!where) return null;
  const session = await db.liveSession.findFirst({ where, include: { teacher: { select: { name: true } } } });
  if (!session) return null;
  const cls = await db.class.findFirst({ where: { id: session.classId, schoolId: s.schoolId }, select: { id: true, name: true } });
  return cls ? { ...session, cls } : null;
}

export type LiveState = Awaited<ReturnType<typeof liveState>>;

/** Everything the classroom page polls for. Students see held chat only if it is their own. */
export async function liveState(s: S, sessionId: string) {
  const session = await db.liveSession.findUniqueOrThrow({ where: { id: sessionId }, select: { id: true, status: true, classId: true, startedAt: true, endedAt: true } });
  const teacher = s.role === "TEACHER";
  const [roster, attendance, chat, polls] = await Promise.all([
    db.enrollment.findMany({ where: { classId: session.classId }, select: { student: { select: { id: true, name: true } } }, orderBy: { student: { name: "asc" } } }),
    db.liveAttendance.findMany({ where: { sessionId } }),
    db.liveChat.findMany({
      where: { sessionId, ...(teacher ? {} : { OR: [{ held: false }, { userId: s.userId }] }) },
      include: { user: { select: { name: true, role: true } } }, orderBy: { createdAt: "desc" }, take: 100,
    }),
    db.livePoll.findMany({ where: { sessionId }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const now = new Date();
  const people = roster.map(({ student }) => {
    const a = attendance.find((x) => x.userId === student.id);
    return { id: student.id, name: student.name, joined: !!a, present: !!a && isPresent(a.lastSeenAt, now), hand: !!a && a.handRaised && isPresent(a.lastSeenAt, now), speaking: !!a?.canSpeak };
  });
  const mine = attendance.find((a) => a.userId === s.userId);
  return {
    status: session.status as "SCHEDULED" | "LIVE" | "ENDED",
    startedAt: session.startedAt?.toISOString() ?? null,
    me: { joined: !!mine, hand: !!mine?.handRaised, canSpeak: !!mine?.canSpeak },
    // Students see classmates who are here now; teachers see the whole roster.
    people: teacher ? people : people.filter((p) => p.present).map((p) => ({ ...p, name: shortName(p.name) })),
    chat: chat.reverse().map((c) => ({
      id: c.id, body: c.body, held: c.held, mine: c.userId === s.userId, at: c.createdAt.toISOString(),
      name: c.user.role === "TEACHER" ? c.user.name : teacher ? c.user.name : shortName(c.user.name),
      host: c.user.role === "TEACHER",
    })),
    polls: polls.map((p) => {
      const { counts, total } = tallyPoll(p.options, p.votes);
      const showResults = teacher || !p.open;
      return { id: p.id, question: p.question, options: p.options, open: p.open, counts: showResults ? counts : null, total: showResults ? total : null, myVote: myVote(p.votes, s.userId) };
    }),
  };
}

/** Class chat: moderated with the same rules as messages. Held lines wait for the teacher. */
export async function postChat(s: S, sessionId: string, body: string) {
  const r = moderate(body);
  // The teacher's own lines are never held: they are the moderator here.
  const held = s.role === "STUDENT" && r.held;
  const c = await db.liveChat.create({ data: { sessionId, userId: s.userId, body, held } });
  if (held) await db.moderationItem.create({ data: { schoolId: s.schoolId, kind: "message", sourceId: c.id, summary: moderationSummary("Class chat message", s.name, r) } });
  return { held };
}
