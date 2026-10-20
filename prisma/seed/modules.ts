import type { PrismaClient } from "@prisma/client";
import { seedStudent } from "./student";
import { seedTeacher } from "./teacher";
import { seedComms } from "./comms";
import { seedAdmin } from "./admin";

/**
 * Demo data for every module beyond the MVP core. Finds people by their demo
 * email, so it works on a fresh seed and on a deployed database that already
 * has the core demo schools. Each part skips itself when its data exists.
 */
export async function seedModules(db: PrismaClient) {
  const crescent = await db.school.findUnique({ where: { slug: "crescent-bay" } });
  if (!crescent) return;
  await seedStudent(db);
  await seedTeacher(db);
  await seedComms(db);
  await seedAdmin(db);
}
