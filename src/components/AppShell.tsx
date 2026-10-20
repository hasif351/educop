import Link from "next/link";
import type { Role } from "@prisma/client";
import { logout } from "@/app/actions-auth";
import { ROLE_LABEL } from "@/lib/roles";
import { NavLinks } from "./NavLinks";

// Every role's pages. Each role also has /<role>/notifications and /<role>/settings.
export const NAV: Record<Role, { href: string; label: string }[]> = {
  STUDENT: [
    { href: "/student", label: "Dashboard" },
    { href: "/student/lessons", label: "Lessons" },
    { href: "/student/assignments", label: "Assignments" },
    { href: "/student/skills", label: "Reasoning skills" },
    { href: "/student/growth", label: "My growth" },
    { href: "/student/for-you", label: "For you" },
    { href: "/student/buddy", label: "Study buddy" },
    { href: "/student/live", label: "Live class" },
  ],
  TEACHER: [
    { href: "/teacher", label: "Dashboard" },
    { href: "/teacher/lessons", label: "Lessons" },
    { href: "/teacher/assignments", label: "Assignments" },
    { href: "/teacher/ai", label: "AI assistant" },
    { href: "/teacher/progress", label: "Student progress" },
    { href: "/teacher/recommendations", label: "Recommendations" },
    { href: "/teacher/live", label: "Virtual classroom" },
    { href: "/teacher/messages", label: "Messages" },
  ],
  PARENT: [
    { href: "/parent", label: "My children" },
    { href: "/parent/home-learning", label: "Home learning" },
    { href: "/parent/messages", label: "Messages" },
  ],
  SCHOOL_ADMIN: [
    { href: "/admin", label: "School overview" },
    { href: "/admin/users", label: "People" },
    { href: "/admin/classes", label: "Classes" },
    { href: "/admin/approvals", label: "Approvals" },
    { href: "/admin/reports", label: "Reports" },
    { href: "/admin/moderation", label: "Moderation" },
    { href: "/admin/school", label: "School settings" },
  ],
  SUPER_ADMIN: [
    { href: "/platform", label: "Overview" },
    { href: "/platform/schools", label: "Schools" },
    { href: "/platform/ai-usage", label: "AI usage" },
    { href: "/platform/moderation", label: "Moderation" },
    { href: "/platform/audit", label: "Audit log" },
  ],
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
