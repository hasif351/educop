import Link from "next/link";
import type { Role } from "@prisma/client";
import { logout } from "@/app/actions-auth";
import { ROLE_LABEL } from "@/lib/roles";
import { NavLinks } from "./NavLinks";

const NAV: Record<Role, { href: string; label: string }[]> = {
  STUDENT: [
    { href: "/student", label: "Dashboard" },
    { href: "/student/lessons", label: "Lessons" },
    { href: "/student/assignments", label: "Assignments" },
  ],
  TEACHER: [
    { href: "/teacher", label: "Dashboard" },
    { href: "/teacher/lessons", label: "Lessons" },
    { href: "/teacher/assignments", label: "Assignments" },
  ],
  PARENT: [{ href: "/parent", label: "My children" }],
  SCHOOL_ADMIN: [{ href: "/admin", label: "School overview" }],
  SUPER_ADMIN: [{ href: "/platform", label: "Schools" }],
};

export function AppShell({
  role, name, schoolName, children,
}: { role: Role; name: string; schoolName: string | null; children: React.ReactNode }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand to-teal text-sm text-white">E</span>
            Educop
          </Link>
          <NavLinks items={NAV[role]} />
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right text-xs sm:block">
              <div className="font-bold">{name}</div>
              <div className="text-muted">{ROLE_LABEL[role]}{schoolName ? ` · ${schoolName}` : ""}</div>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-teal-soft font-display text-xs font-bold text-teal">{initials}</span>
            <form action={logout}><button className="btn btn-sm">Sign out</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
