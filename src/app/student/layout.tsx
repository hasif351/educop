import { AppShell } from "@/components/AppShell";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const s = await requireRole("STUDENT");
  const school = s.schoolId ? await db.school.findUnique({ where: { id: s.schoolId }, select: { name: true } }) : null;
  return <AppShell role={s.role} name={s.name} schoolName={school?.name ?? null}>{children}</AppShell>;
}
