import type { Role } from "@prisma/client";

/** Where each role lands after sign-in, and the URL prefix it owns. */
export const ROLE_HOME: Record<Role, string> = {
  STUDENT: "/student",
  TEACHER: "/teacher",
  PARENT: "/parent",
  SCHOOL_ADMIN: "/admin",
  SUPER_ADMIN: "/platform",
};

export const ROLE_LABEL: Record<Role, string> = {
  STUDENT: "Student",
  TEACHER: "Teacher",
  PARENT: "Parent",
  SCHOOL_ADMIN: "School admin",
  SUPER_ADMIN: "Platform admin",
};

/** Which role may open a URL prefix. Checked in middleware and again on the server. */
export function roleForPath(pathname: string): Role | null {
  for (const [role, home] of Object.entries(ROLE_HOME) as [Role, string][]) {
    if (pathname === home || pathname.startsWith(home + "/")) return role;
  }
  return null;
}
