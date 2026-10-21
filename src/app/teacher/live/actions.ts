"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { liveSessionFor, postChat } from "@/lib/live";
import { newRoomName, parseMeetingUrl } from "@/lib/live-utils";
import { closeRoom, livekitEnabled, muteStudents, setSpeaker } from "@/lib/livekit";

export type LiveFormState = { error?: string; ok?: string };

const Id = z.string().min(1).max(40);

async function own(id: string) {
  const s = await requireRole("TEACHER");
  const session = await liveSessionFor(s, Id.parse(id));
  if (!session) throw new Error("Live session not found");
  return { s, session };
}

const Schedule = z.object({
  classId: z.string().min(1, "Choose a class.").max(40),
  title: z.string().trim().min(3, "Give the class a title.").max(120),
  startsAt: z.string().min(1, "Pick a date and time."),
  durationMin: z.coerce.number().int().min(10, "Classes run 10 to 180 minutes.").max(180, "Classes run 10 to 180 minutes."),
  provider: z.enum(["educop", "teams", "meet", "jitsi"]).default("teams"),
  meetingUrl: z.string().max(2000).default(""),
});

/**
 * Teams and Meet classes need a valid join link from that service; the built-in
 * rooms need none. Educop live is offered only when LiveKit is configured.
 */
function meeting(provider: "educop" | "teams" | "meet" | "jitsi", raw: string): { provider: string; meetingUrl: string | null } | { error: string } {
  if (provider === "educop") return livekitEnabled() ? { provider, meetingUrl: null } : { error: "Educop live needs a LiveKit account. Choose another video service." };
  if (provider === "jitsi") return { provider, meetingUrl: null };
  const name = provider === "teams" ? "Microsoft Teams" : "Google Meet";
  const parsed = parseMeetingUrl(raw);
  if (!parsed || parsed.provider !== provider) return { error: `Paste the ${name} join link (it starts with ${provider === "teams" ? "https://teams.microsoft.com" : "https://meet.google.com"}).` };
  return { provider, meetingUrl: parsed.url };
}

export async function scheduleLive(_: LiveFormState, form: FormData): Promise<LiveFormState> {
  const s = await requireRole("TEACHER");
  const parsed = Schedule.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const cls = await db.class.findFirst({ where: { id: v.classId, schoolId: s.schoolId, teacherId: s.userId }, select: { id: true } });
  if (!cls) return { error: "You can only schedule classes you teach." };
  // datetime-local values are school time (GST, UTC+4).
  const startsAt = new Date(`${v.startsAt}:00+04:00`);
  if (Number.isNaN(startsAt.getTime())) return { error: "Pick a valid date and time." };
  const m = meeting(v.provider, v.meetingUrl);
  if ("error" in m) return m;
  const live = await db.liveSession.create({ data: { schoolId: s.schoolId, classId: cls.id, teacherId: s.userId, title: v.title, startsAt, durationMin: v.durationMin, roomName: newRoomName(), ...m } });
  await audit(s, "live.schedule", live.id);
  revalidatePath("/teacher/live");
  return { ok: "Class scheduled." };
}

export async function setMeetingLink(id: string, _: LiveFormState, form: FormData): Promise<LiveFormState> {
  const { s, session } = await own(id);
  if (session.status === "ENDED") return { error: "This class has ended." };
  const v = Schedule.pick({ provider: true, meetingUrl: true }).safeParse(Object.fromEntries(form));
  if (!v.success) return { error: v.error.issues[0].message };
  const m = meeting(v.data.provider, v.data.meetingUrl);
  if ("error" in m) return m;
  await db.liveSession.update({ where: { id: session.id }, data: m });
  await audit(s, "live.video", session.id, { provider: m.provider });
  revalidatePath(`/teacher/live/${session.id}`);
  return { ok: "Video link saved." };
}

export async function startLive(id: string) {
  const { s, session } = await own(id);
  if (session.status !== "SCHEDULED") return;
  await db.liveSession.update({ where: { id: session.id }, data: { status: "LIVE", startedAt: new Date() } });
  const students = await db.enrollment.findMany({ where: { classId: session.classId }, select: { studentId: true } });
  await notify(students.map((e) => e.studentId), {
    schoolId: s.schoolId, kind: "class", title: `Live class has started: ${session.title}`,
    body: `${session.cls.name} with ${session.teacher.name}. Join now.`, href: `/student/live/${session.id}`,
  });
  await audit(s, "live.start", session.id);
  revalidatePath("/teacher/live");
  redirect(`/teacher/live/${session.id}`);
}

export async function endLive(id: string) {
  const { s, session } = await own(id);
  if (session.status !== "LIVE") return;
  await db.$transaction([
    db.liveSession.update({ where: { id: session.id }, data: { status: "ENDED", endedAt: new Date() } }),
    db.livePoll.updateMany({ where: { sessionId: session.id }, data: { open: false } }),
    db.liveAttendance.updateMany({ where: { sessionId: session.id }, data: { handRaised: false, canSpeak: false } }),
  ]);
  // Educop live: close the video room so nobody stays connected. Best effort.
  if (session.provider === "educop" && livekitEnabled()) await closeRoom(session.roomName);
  await audit(s, "live.end", session.id);
  revalidatePath("/teacher/live");
  revalidatePath(`/teacher/live/${session.id}`);
}

const Poll = z.object({
  question: z.string().trim().min(3, "Write a question.").max(200),
  options: z.array(z.string().trim().min(1).max(80)).min(2, "Add at least two options.").max(6, "Up to six options."),
});

export async function createPoll(id: string, question: string, options: string[]): Promise<LiveFormState> {
  const { s, session } = await own(id);
  if (session.status !== "LIVE") return { error: "Start the class before running a poll." };
  const parsed = Poll.safeParse({ question, options: options.map((o) => o.trim()).filter(Boolean) });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // One open poll at a time keeps it simple for students.
  await db.livePoll.updateMany({ where: { sessionId: session.id, open: true }, data: { open: false } });
  const p = await db.livePoll.create({ data: { sessionId: session.id, question: parsed.data.question, options: parsed.data.options } });
  await audit(s, "live.poll", p.id);
  return {};
}

export async function setPollOpen(id: string, pollId: string, open: boolean) {
  const { session } = await own(id);
  if (open) await db.livePoll.updateMany({ where: { sessionId: session.id, open: true }, data: { open: false } });
  await db.livePoll.updateMany({ where: { id: Id.parse(pollId), sessionId: session.id }, data: { open: open && session.status === "LIVE" } });
}

export async function moderateChat(id: string, chatId: string, decision: "approve" | "remove") {
  const { s, session } = await own(id);
  const c = await db.liveChat.findFirst({ where: { id: Id.parse(chatId), sessionId: session.id } });
  if (!c) return;
  if (decision === "approve") await db.liveChat.update({ where: { id: c.id }, data: { held: false } });
  else await db.liveChat.delete({ where: { id: c.id } });
  await db.moderationItem.updateMany({ where: { kind: "message", sourceId: c.id, status: "OPEN" }, data: { status: decision === "approve" ? "RESOLVED" : "DISMISSED", resolvedById: s.userId, resolvedAt: new Date() } });
  await audit(s, `live.chat.${decision}`, c.id);
}

export async function lowerHand(id: string, userId: string) {
  const { session } = await own(id);
  await db.liveAttendance.updateMany({ where: { sessionId: session.id, userId: Id.parse(userId) }, data: { handRaised: false } });
}

export async function teacherChat(id: string, body: string): Promise<LiveFormState> {
  const { s, session } = await own(id);
  const text = z.string().trim().min(1).max(500).safeParse(body);
  if (!text.success) return { error: "Messages are 1 to 500 characters." };
  if (session.status !== "LIVE") return { error: "Chat is open while the class is live." };
  await postChat(s, session.id, text.data);
  return {};
}

/**
 * Educop live: lets a student use their mic and camera ("Invite to speak"), or
 * takes it back ("Stop"). Saved first, so a student who reconnects keeps it.
 */
export async function setSpeaking(id: string, userId: string, on: boolean): Promise<LiveFormState> {
  const { s, session } = await own(id);
  if (session.provider !== "educop") return { error: "Inviting students to speak works in Educop live classes." };
  if (session.status !== "LIVE") return { error: "Start the class first." };
  const uid = Id.parse(userId);
  const allow = z.boolean().parse(on);
  // Only a student enrolled in this class who has joined it.
  const r = await db.liveAttendance.updateMany({
    where: { sessionId: session.id, userId: uid, user: { role: "STUDENT", schoolId: s.schoolId, enrollments: { some: { classId: session.classId } } } },
    data: allow ? { canSpeak: true, handRaised: false } : { canSpeak: false },
  });
  if (!r.count) return { error: "That student hasn't joined the class." };
  const applied = livekitEnabled() && (await setSpeaker(session.roomName, uid, allow));
  await audit(s, allow ? "live.speak.invite" : "live.speak.stop", session.id, { studentId: uid });
  // Not in the video room right now (or LiveKit didn't answer): their next token carries the change.
  return applied ? {} : { ok: "Saved. It applies when their video reconnects." };
}

/** Educop live: mutes every student microphone. Students who are invited can unmute themselves. */
export async function muteAll(id: string): Promise<LiveFormState> {
  const { s, session } = await own(id);
  if (session.provider !== "educop" || session.status !== "LIVE" || !livekitEnabled()) return { error: "Mute all works while an Educop live class is running." };
  const n = await muteStudents(session.roomName);
  if (n == null) return { error: "Couldn't reach the live video service. Try again." };
  await audit(s, "live.mute_all", session.id, { muted: n });
  return { ok: n ? `Muted ${n} ${n === 1 ? "microphone" : "microphones"}.` : "No student microphones were on." };
}
