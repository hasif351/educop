import "server-only";
import { notFound } from "next/navigation";
import { db } from "./db";
import type { SessionPayload } from "./session";

// Parent <-> teacher messaging, always about one student. A parent may write to
// teachers who teach their VERIFIED child; a teacher to verified parents of
// students in their classes. Everything is scoped to the caller's school.

type S = SessionPayload & { schoolId: string };
export type Contact = { otherId: string; otherName: string; studentId: string; studentName: string; context: string };

export async function messageContacts(s: S): Promise<Contact[]> {
  if (s.role === "PARENT") {
    const links = await db.parentStudent.findMany({
      where: { parentId: s.userId, verified: true, student: { schoolId: s.schoolId } },
      select: { student: { select: { id: true, name: true, enrollments: { where: { class: { schoolId: s.schoolId } }, select: { class: { select: { name: true, teacher: { select: { id: true, name: true } } } } } } } } },
    });
    const out = new Map<string, Contact>();
    for (const { student } of links) {
      for (const { class: c } of student.enrollments) {
        const key = `${c.teacher.id}:${student.id}`;
        const prev = out.get(key);
        out.set(key, { otherId: c.teacher.id, otherName: c.teacher.name, studentId: student.id, studentName: student.name, context: prev ? `${prev.context}, ${c.name}` : c.name });
      }
    }
    return [...out.values()].sort((a, b) => a.studentName.localeCompare(b.studentName) || a.otherName.localeCompare(b.otherName));
  }
  if (s.role === "TEACHER") {
    const links = await db.parentStudent.findMany({
      where: { verified: true, parent: { schoolId: s.schoolId }, student: { schoolId: s.schoolId, enrollments: { some: { class: { teacherId: s.userId, schoolId: s.schoolId } } } } },
      select: { parent: { select: { id: true, name: true } }, student: { select: { id: true, name: true, enrollments: { where: { class: { teacherId: s.userId } }, select: { class: { select: { name: true } } } } } } },
    });
    return links.map((l) => ({ otherId: l.parent.id, otherName: l.parent.name, studentId: l.student.id, studentName: l.student.name, context: l.student.enrollments.map((e) => e.class.name).join(", ") }))
      .sort((a, b) => a.studentName.localeCompare(b.studentName) || a.otherName.localeCompare(b.otherName));
  }
  return [];
}

/** The relationship check behind every read and send. */
export async function canMessage(s: S, otherId: string, studentId: string) {
  if (s.role === "PARENT") {
    const [link, cls] = await Promise.all([
      db.parentStudent.findFirst({ where: { parentId: s.userId, studentId, verified: true, student: { schoolId: s.schoolId } } }),
      db.class.findFirst({ where: { schoolId: s.schoolId, teacherId: otherId, enrollments: { some: { studentId } } }, select: { id: true } }),
    ]);
    return !!link && !!cls;
  }
  if (s.role === "TEACHER") {
    const [cls, link] = await Promise.all([
      db.class.findFirst({ where: { schoolId: s.schoolId, teacherId: s.userId, enrollments: { some: { studentId } } }, select: { id: true } }),
      db.parentStudent.findFirst({ where: { parentId: otherId, studentId, verified: true, parent: { schoolId: s.schoolId } } }),
    ]);
    return !!cls && !!link;
  }
  return false;
}

/** Conversations grouped by (other person, student), newest first. Held messages are hidden from recipients. */
export async function conversations(s: S) {
  const msgs = await db.message.findMany({
    where: { schoolId: s.schoolId, OR: [{ fromId: s.userId }, { toId: s.userId, held: false }] },
    include: { from: { select: { id: true, name: true } }, to: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const studentIds = [...new Set(msgs.map((m) => m.studentId).filter((x): x is string => !!x))];
  const students = await db.user.findMany({ where: { id: { in: studentIds }, schoolId: s.schoolId }, select: { id: true, name: true } });
  const groups = new Map<string, { otherId: string; otherName: string; studentId: string; studentName: string; last: (typeof msgs)[number]; unread: number }>();
  for (const m of msgs) {
    if (!m.studentId) continue;
    const other = m.fromId === s.userId ? m.to : m.from;
    const key = `${other.id}:${m.studentId}`;
    const g = groups.get(key) ?? { otherId: other.id, otherName: other.name, studentId: m.studentId, studentName: students.find((x) => x.id === m.studentId)?.name ?? "Student", last: m, unread: 0 };
    if (m.toId === s.userId && !m.readAt) g.unread++;
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** One conversation. Marks incoming messages read. A pair the caller may not message is a 404. */
export async function thread(s: S, otherId: string, studentId: string) {
  if (!(await canMessage(s, otherId, studentId))) notFound();
  const [other, student] = await Promise.all([
    db.user.findFirstOrThrow({ where: { id: otherId, schoolId: s.schoolId }, select: { id: true, name: true } }),
    db.user.findFirstOrThrow({ where: { id: studentId, schoolId: s.schoolId }, select: { id: true, name: true } }),
  ]);
  const pair = [{ fromId: s.userId, toId: otherId }, { fromId: otherId, toId: s.userId, held: false }];
  const messages = await db.message.findMany({ where: { schoolId: s.schoolId, studentId, OR: pair }, orderBy: { createdAt: "asc" }, take: 300 });
  await db.message.updateMany({ where: { schoolId: s.schoolId, studentId, fromId: otherId, toId: s.userId, held: false, readAt: null }, data: { readAt: new Date() } });
  return { other, student, messages };
}
