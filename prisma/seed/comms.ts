import type { PrismaClient } from "@prisma/client";

// Demo data for the comms modules. Must be idempotent: it also runs against a
// database that was seeded before these modules existed (see seed/modules.ts).
export async function seedComms(db: PrismaClient) {
  void db;
}
