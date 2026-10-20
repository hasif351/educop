"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canMessage } from "@/lib/messages";
import { moderate, moderationSummary } from "@/lib/moderate";
import { notify } from "@/lib/notify";
import { ROLE_HOME } from "@/lib/roles";

export type MessageState = { error?: string };

const Send = z.object({
  to: z.string().min(1, "Choose who to write to.").max(40),
  student: z.string().min(1, "Choose who to write to.").max(40),
  body: z.string().trim().min(1, "Write a message first.").max(2000, "Keep messages under 2,000 characters."),
});

export async function sendMessage(_: MessageState, form: FormData): Promise<MessageState> {
  const s = await requireRole("PARENT", "TEACHER");
  const raw = Object.fromEntries(form);
  // The compose form sends "teacherId:studentId" as one choice.
  if (typeof raw.pair === "string" && raw.pair.includes(":")) [raw.to, raw.student] = raw.pair.split(":");
  const parsed = Send.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  if (!(await canMessage(s, v.to, v.student))) return { error: "You can only message about your own children and their teachers." };

  const mod = moderate(v.body);
  const msg = await db.message.create({ data: { schoolId: s.schoolId, fromId: s.userId, toId: v.to, studentId: v.student, body: v.body, held: mod.held } });
  if (mod.held) {
    await db.moderationItem.create({ data: { schoolId: s.schoolId, kind: "message", sourceId: msg.id, summary: moderationSummary("Parent–teacher message", s.name, mod) } });
  } else {
    const otherHome = s.role === "PARENT" ? "/teacher" : "/parent";
    await notify([v.to], { schoolId: s.schoolId, kind: "message", title: `New message from ${s.name}`, body: v.body.slice(0, 140), href: `${otherHome}/messages?with=${s.userId}&student=${v.student}` });
  }
  await audit(s, "message.send", msg.id, { held: mod.held, reasons: mod.reasons });
  const home = ROLE_HOME[s.role];
  revalidatePath(`${home}/messages`);
  redirect(`${home}/messages?with=${v.to}&student=${v.student}${mod.held ? "&held=1" : ""}`);
}
