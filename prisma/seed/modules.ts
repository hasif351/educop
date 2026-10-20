import type { PrismaClient } from "@prisma/client";
import { seedStudent } from "./student";
import { seedTeacher } from "./teacher";
import { seedComms } from "./comms";
import { seedAdmin } from "./admin";
import { seedRecordings } from "./recordings";

/**
 * Demo data for every module beyond the MVP core. Finds people by their demo
 * email, so it works on a fresh seed and on a deployed database that already
 * has the core demo schools. Each part skips itself when its data exists.
 */
export async function seedModules(db: PrismaClient) {
  const crescent = await db.school.findUnique({ where: { slug: "crescent-bay" } });
  if (!crescent) return;
  await seedStudent(db);
  await shareOneCheckinWithParent(db);
  await seedTeacher(db);
  await seedComms(db);
  await seedAdmin(db);
  await seedRecordings(db);
}

/** Layla shares her latest happy check-in with her parent, so the parent portal shows the feature. */
async function shareOneCheckinWithParent(db: PrismaClient) {
  const layla = await db.user.findUnique({ where: { email: "layla@crescentbay.example" } });
  if (!layla || (await db.selCheckin.count({ where: { studentId: layla.id, sharedWithParent: true } })) > 0) return;
  const c = await db.selCheckin.findFirst({ where: { studentId: layla.id, mood: { gte: 4 } }, orderBy: { createdAt: "desc" } });
  if (c) await db.selCheckin.update({ where: { id: c.id }, data: { sharedWithParent: true } });
}
