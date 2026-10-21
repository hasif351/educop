import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { liveSessionFor } from "@/lib/live";
import { livekitEnabled, videoToken } from "@/lib/livekit";
import { mayGetToken } from "@/lib/livekit-utils";
import { shortName } from "@/lib/live-utils";

// Educop live: issues the caller's own short-lived LiveKit token for this class.
// Only the class teacher and enrolled students who joined, only while it's live.
// POST so a cross-site page can't trigger it (the session cookie is SameSite=Lax).
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("TEACHER", "STUDENT");
  const session = await liveSessionFor(s, (await params).id.slice(0, 40));
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  if (session.provider !== "educop") return NextResponse.json({ error: "This class doesn't use Educop live." }, { status: 400, headers: NO_STORE });
  if (!livekitEnabled()) return NextResponse.json({ error: "Live video isn't set up for this school yet." }, { status: 501, headers: NO_STORE });
  const role = s.role as "TEACHER" | "STUDENT";
  const mine = role === "STUDENT"
    ? await db.liveAttendance.findUnique({ where: { sessionId_userId: { sessionId: session.id, userId: s.userId } }, select: { canSpeak: true } })
    : null;
  if (!mayGetToken({ role, status: session.status, joined: !!mine })) {
    return NextResponse.json({ error: session.status === "LIVE" ? "Join the class first." : "This class isn't live right now." }, { status: 409, headers: NO_STORE });
  }
  // Classmates see each other as "Noah F.", as everywhere else in the classroom.
  const name = role === "STUDENT" ? shortName(s.name) : s.name;
  const t = await videoToken({ room: session.roomName, userId: s.userId, name, role, canSpeak: !!mine?.canSpeak });
  return NextResponse.json(t, { headers: NO_STORE });
}
