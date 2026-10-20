import type { PrismaClient } from "@prisma/client";

// Demo data for the teacher modules. Must be idempotent: it also runs against a
// database that was seeded before these modules existed (see seed/modules.ts).
export async function seedTeacher(db: PrismaClient) {
  void db;
}
