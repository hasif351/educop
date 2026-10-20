"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { liveSessionFor, postChat } from "@/lib/live";

const Id = z.string().min(1).max(40);

async function enrolled(id: string) {
  const s = await requireRole("STUDENT");
  const session = await liveSessionFor(s, Id.parse(id));
  if (!session) throw new Error("Live session not found");
  return { s, session };
}

/** Records attendance. Re-joining keeps the first join time. */
export async function joinLive(id: string) {
  const { s, session } = await enrolled(id);
  if (session.status !== "LIVE") return { error: "This class isn't live right now." };
  const existing = await db.liveAttendance.findUnique({ where: { sessionId_userId: { sessionId: session.id, userId: s.userId } } });
  await db.liveAttendance.upsert({
    where: { sessionId_userId: { sessionId: session.id, userId: s.userId } },
    create: { sessionId: session.id, userId: s.userId },
    update: { lastSeenAt: new Date() },
  });
  if (!existing) await audit(s, "live.join", session.id);
  return {};
}

export async function setHand(id: string, raised: boolean) {
  const { s, session } = await enrolled(id);
  if (session.status !== "LIVE") return;
  await db.liveAttendance.updateMany({ where: { sessionId: session.id, userId: s.userId }, data: { handRaised: raised === true } });
}

export async function votePoll(id: string, pollId: string, option: number) {
  const { s, session } = await enrolled(id);
  const poll = await db.livePoll.findFirst({ where: { id: Id.parse(pollId), sessionId: session.id, open: true } });
  const idx = z.number().int().min(0).safeParse(option);
  if (!poll || !idx.success || idx.data >= poll.options.length) return;
  // Atomic update of one key in the votes JSON, so simultaneous votes don't overwrite each other.
  await db.$executeRaw`UPDATE "LivePoll" SET votes = jsonb_set(votes, ARRAY[${s.userId}]::text[], to_jsonb(${idx.data}::int)) WHERE id = ${poll.id} AND open = true`;
}

export async function studentChat(id: string, body: string): Promise<{ error?: string; held?: boolean }> {
  const { s, session } = await enrolled(id);
  const text = z.string().trim().min(1).max(500).safeParse(body);
  if (!text.success) return { error: "Messages are 1 to 500 characters." };
  if (session.status !== "LIVE") return { error: "Chat is open while the class is live." };
  const joined = await db.liveAttendance.findUnique({ where: { sessionId_userId: { sessionId: session.id, userId: s.userId } } });
  if (!joined) return { error: "Join the class to chat." };
  return postChat(s, session.id, text.data);
}
