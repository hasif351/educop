"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { homeActivities, toggleDone } from "@/lib/home-learning";
import { homeLearningInputs } from "@/lib/data-parent";

const Toggle = z.object({
  childId: z.string().min(1).max(40),
  key: z.string().regex(/^(rec:[\w-]{1,40}|lesson:[\w-]{1,40}:(ws|ask))$/),
  done: z.boolean(),
});

/** "We did this" on a home activity. Stored in the parent's own prefs, keyed by child. */
export async function toggleHomeActivity(childId: string, key: string, done: boolean) {
  const s = await requireRole("PARENT");
  const v = Toggle.parse({ childId, key, done });
  // Only activities this verified child actually has this week can be ticked.
  const inputs = await homeLearningInputs(s, v.childId);
  if (!homeActivities(inputs.recs, inputs.lessons).some((a) => a.key === v.key)) throw new Error("Activity not found");
  const me = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { prefs: true } });
  await db.user.update({ where: { id: s.userId }, data: { prefs: toggleDone(me.prefs, `${v.childId}|${v.key}`, v.done) } });
  await audit(s, v.done ? "home_activity.done" : "home_activity.undo", v.key, { childId: v.childId });
  revalidatePath("/parent", "layout");
}
