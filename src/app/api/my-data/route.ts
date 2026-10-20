import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

// "Download my data": a JSON file of the signed-in user's own records. Only rows
// that belong to (or were written by) this user; never other people's work.
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = s.userId;
  const me = { userId: id };
  const [
    user, notifications, consents, messagesSent, messagesReceived, submissions, lessonProgress, recommendations,
    cognitiveSessions, selCheckins, selGoals, pointEvents, badges, aiMessages, aiDrafts, liveAttendance, liveChat, recordingViews, links, activity,
  ] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, email: true, name: true, role: true, gradeLevel: true, createdAt: true, lastLoginAt: true, prefs: true, points: true, school: { select: { name: true } } },
    }),
    db.notification.findMany({ where: me, orderBy: { createdAt: "desc" } }),
    db.consent.findMany({ where: me }),
    db.message.findMany({ where: { fromId: id }, orderBy: { createdAt: "desc" } }),
    db.message.findMany({ where: { toId: id, held: false }, orderBy: { createdAt: "desc" } }),
    db.submission.findMany({ where: { studentId: id }, include: { answers: true, assignment: { select: { title: true } } } }),
    db.lessonProgress.findMany({ where: { studentId: id }, include: { lesson: { select: { title: true } } } }),
    db.recommendation.findMany({ where: { studentId: id } }),
    db.cognitiveSession.findMany({ where: { studentId: id } }),
    db.selCheckin.findMany({ where: { studentId: id } }),
    db.selGoal.findMany({ where: { studentId: id } }),
    db.pointEvent.findMany({ where: { studentId: id } }),
    db.studentBadge.findMany({ where: { studentId: id } }),
    db.aiMessage.findMany({ where: me }),
    db.aiDraft.findMany({ where: { teacherId: id } }),
    db.liveAttendance.findMany({ where: me, include: { session: { select: { title: true, startsAt: true } } } }),
    db.liveChat.findMany({ where: me }),
    db.recordingView.findMany({ where: { studentId: id }, include: { recording: { select: { title: true } } } }),
    db.parentStudent.findMany({ where: { OR: [{ parentId: id }, { studentId: id }] }, select: { parentId: true, studentId: true, verified: true, createdAt: true } }),
    db.auditLog.findMany({ where: { actorId: id }, select: { action: true, target: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1000 }),
  ]);
  await audit({ userId: id, schoolId: s.schoolId }, "privacy.export");
  const body = {
    exportedAt: new Date().toISOString(),
    note: "Records Educop holds about you. Passwords are never included.",
    user, consents, notifications, messages: { sent: messagesSent, received: messagesReceived }, parentLinks: links,
    learning: { submissions, lessonProgress, recommendations, cognitiveSessions, pointEvents, badges },
    wellbeing: { selCheckins, selGoals }, ai: { aiMessages, aiDrafts }, liveClasses: { liveAttendance, liveChat }, recordedClasses: recordingViews, activity,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="educop-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
