"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { generate } from "@/lib/ai";
import { dayBounds } from "@/lib/data";
import { novaAccess } from "@/lib/data-student-modules";
import {
  NOVA_DAILY_LIMIT, NOVA_MAX_CHARS, REFUSAL_REPLY, SAFETY_LABEL, SAFETY_MODEL, TEMPLATE_MODEL,
  novaSystemPrompt, offlineReply, screenMessage,
} from "@/lib/nova";

export type ChatMsg = { id: string; role: string; content: string; flagged: boolean; model: string | null };
export type SendResult = { error?: string; messages?: ChatMsg[]; remaining?: number };

const Ask = z.string().trim().min(1, "Type a question first.").max(NOVA_MAX_CHARS, `Keep questions under ${NOVA_MAX_CHARS} characters.`);
const pick = (m: ChatMsg) => ({ id: m.id, role: m.role, content: m.content, flagged: m.flagged, model: m.model });

export async function askNova(text: string): Promise<SendResult> {
  const s = await requireRole("STUDENT");
  const parsed = Ask.safeParse(text);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const question = parsed.data;

  const access = await novaAccess(s);
  if (!access.allowed) return { error: "The study buddy isn't turned on for you right now." };
  const { start } = dayBounds();
  const used = await db.aiMessage.count({ where: { schoolId: s.schoolId, userId: s.userId, role: "user", createdAt: { gte: start } } });
  if (used >= NOVA_DAILY_LIMIT) return { error: `You've asked ${NOVA_DAILY_LIMIT} questions today, which is the daily limit. Nova will be back tomorrow. Your teacher can help in the meantime.` };

  const base = { schoolId: s.schoolId, userId: s.userId };
  const screen = screenMessage(question);
  if (!screen.ok) {
    // Not sent to the model. The student gets a caring fixed reply and the turn goes to school review.
    const mine = await db.aiMessage.create({ data: { ...base, role: "user", content: question, flagged: true } });
    const reply = await db.aiMessage.create({ data: { ...base, role: "assistant", content: screen.reply, flagged: true, model: SAFETY_MODEL } });
    await db.moderationItem.create({ data: { schoolId: s.schoolId, kind: "ai_reply", sourceId: mine.id, summary: `Study buddy: a student message was held for safety review (${SAFETY_LABEL[screen.category]}).` } });
    await audit(s, "ai.safety_hold", mine.id, { category: screen.category });
    return { messages: [pick(mine), pick(reply)], remaining: NOVA_DAILY_LIMIT - used - 1 };
  }

  const [user, classes, history] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { gradeLevel: true, name: true } }),
    db.class.findMany({ where: { schoolId: s.schoolId, enrollments: { some: { studentId: s.userId } } }, select: { subject: { select: { name: true } } } }),
    db.aiMessage.findMany({ where: { ...base, flagged: false, createdAt: { gte: start } }, orderBy: { createdAt: "desc" }, take: 10, select: { role: true, content: true } }),
  ]);
  const mine = await db.aiMessage.create({ data: { ...base, role: "user", content: question } });

  // The model needs turns that alternate and start with the student.
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of history.reverse()) {
    const role = m.role === "assistant" ? "assistant" : "user";
    if (turns.length === 0 && role === "assistant") continue;
    if (turns.at(-1)?.role === role) turns[turns.length - 1].content += `\n${m.content}`;
    else turns.push({ role, content: m.content });
  }
  if (turns.at(-1)?.role === "user") turns.pop();
  turns.push({ role: "user", content: question });

  const ai = await generate({
    system: novaSystemPrompt({ gradeLevel: user.gradeLevel, firstName: user.name.split(" ")[0], subjects: [...new Set(classes.map((c) => c.subject.name))] }),
    messages: turns, maxTokens: 600,
  });
  const content = ai.offline || !ai.text ? offlineReply(question) : ai.refused ? REFUSAL_REPLY : ai.text.slice(0, 4000);
  const reply = await db.aiMessage.create({
    data: { ...base, role: "assistant", content, model: ai.offline || !ai.text ? TEMPLATE_MODEL : ai.model, inputTokens: ai.inputTokens, outputTokens: ai.outputTokens },
  });
  return { messages: [pick(mine), pick(reply)], remaining: NOVA_DAILY_LIMIT - used - 1 };
}

const Flag = z.object({ id: z.string().min(1).max(40), reason: z.string().trim().max(300).default("") });

/** A student reports a Nova reply as wrong or unhelpful; it goes to the school's moderation queue. */
export async function flagReply(id: string, reason: string): Promise<{ ok?: boolean; error?: string }> {
  const s = await requireRole("STUDENT");
  const v = Flag.safeParse({ id, reason });
  if (!v.success) return { error: "Keep the reason under 300 characters." };
  const msg = await db.aiMessage.findFirst({ where: { id: v.data.id, schoolId: s.schoolId, userId: s.userId, role: "assistant" } });
  if (!msg) return { error: "Reply not found." };
  if (!msg.flagged) {
    await db.aiMessage.update({ where: { id: msg.id }, data: { flagged: true } });
    await db.moderationItem.create({
      data: { schoolId: s.schoolId, kind: "ai_reply", sourceId: msg.id, summary: `AI tutor reply flagged by student${v.data.reason ? `: "${v.data.reason}"` : ": answer seemed wrong"}`.slice(0, 500) },
    });
    await audit(s, "ai.reply_flag", msg.id);
  }
  return { ok: true };
}
