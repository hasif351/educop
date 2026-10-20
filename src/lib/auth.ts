import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session";
import { ROLE_HOME } from "./roles";

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/**
 * Server-side guard for pages and actions. Middleware already blocks the wrong
 * role by URL; this repeats the check next to the data access.
 */
export async function requireRole(...roles: Role[]): Promise<SessionPayload & { schoolId: string }> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!roles.includes(s.role)) redirect(ROLE_HOME[s.role]);
  if (s.role !== "SUPER_ADMIN" && !s.schoolId) redirect("/login");
  return s as SessionPayload & { schoolId: string };
}
