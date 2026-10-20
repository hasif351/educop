import type { PrismaClient } from "@prisma/client";

// Demo data for the student modules. Must be idempotent: it also runs against a
// database that was seeded before these modules existed (see seed/modules.ts).
export async function seedStudent(db: PrismaClient) {
  void db;
}
