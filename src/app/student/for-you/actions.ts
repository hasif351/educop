"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { award } from "@/lib/points";

const Input = z.object({ id: z.string().min(1).max(40), status: z.enum(["DONE", "DISMISSED"]) });

/** The student marks one of their own active suggestions done, or hides it. */
export async function setRecommendationStatus(id: string, status: "DONE" | "DISMISSED") {
  const s = await requireRole("STUDENT");
  const v = Input.parse({ id, status });
  const rec = await db.recommendation.findFirst({ where: { id: v.id, schoolId: s.schoolId, studentId: s.userId, status: "ACTIVE" } });
  if (!rec) throw new Error("Recommendation not found");
  await db.recommendation.update({ where: { id: rec.id }, data: { status: v.status } });
  if (v.status === "DONE") await award(s.userId, s.schoolId, 5, `Finished a suggestion: ${rec.title}`.slice(0, 200), `rec:${rec.id}`);
  await audit(s, `recommendation.student_${v.status.toLowerCase()}`, rec.id);
  revalidatePath("/student/for-you");
  revalidatePath("/student");
}
