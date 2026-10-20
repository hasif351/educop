import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { liveSessionFor, liveState } from "@/lib/live";

// Polled every ~5 s by the classroom page. For a student who has joined a live
// session, each call is also the attendance heartbeat. POST so a cross-site
// page can't trigger it (the session cookie is SameSite=Lax).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || !s.schoolId || (s.role !== "TEACHER" && s.role !== "STUDENT")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await params;
  const session = await liveSessionFor({ ...s, schoolId: s.schoolId }, id.slice(0, 40));
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const beat = await req.json().then((b) => b?.beat === true).catch(() => false);
  if (beat && s.role === "STUDENT" && session.status === "LIVE") {
    await db.liveAttendance.updateMany({ where: { sessionId: id, userId: s.userId }, data: { lastSeenAt: new Date() } });
  }
  return NextResponse.json(await liveState({ ...s, schoolId: s.schoolId }, session.id), { headers: { "Cache-Control": "no-store" } });
}
