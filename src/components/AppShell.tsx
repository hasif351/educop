import Link from "next/link";
import type { Role } from "@prisma/client";
import { logout } from "@/app/actions-auth";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { prefClasses, readPrefs } from "@/lib/prefs";
import { ROLE_HOME, ROLE_LABEL } from "@/lib/roles";
import { Icon } from "./icons";
import { MobileNav, NavLinks, PageTitle, UserMenu } from "./NavLinks";

const own = (role: Role) => [
  { href: `${ROLE_HOME[role]}/notifications`, label: "Notifications" },
  { href: `${ROLE_HOME[role]}/settings`, label: "Settings & privacy" },
];

// Every role's pages, ending with /<role>/notifications and /<role>/settings.
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
    { href: "/student/recordings", label: "Recorded classes" },
    ...own("STUDENT"),
  ],
  TEACHER: [
    { href: "/teacher", label: "Dashboard" },
    { href: "/teacher/lessons", label: "Lessons" },
    { href: "/teacher/assignments", label: "Assignments" },
    { href: "/teacher/ai", label: "AI assistant" },
    { href: "/teacher/progress", label: "Student progress" },
    { href: "/teacher/recommendations", label: "Recommendations" },
    { href: "/teacher/live", label: "Virtual classroom" },
    { href: "/teacher/recordings", label: "Recorded classes" },
    { href: "/teacher/messages", label: "Messages" },
    ...own("TEACHER"),
  ],
  PARENT: [
    { href: "/parent", label: "My children" },
    { href: "/parent/home-learning", label: "Home learning" },
    { href: "/parent/messages", label: "Messages" },
    ...own("PARENT"),
  ],
  SCHOOL_ADMIN: [
    { href: "/admin", label: "School overview" },
    { href: "/admin/users", label: "People" },
    { href: "/admin/classes", label: "Classes" },
    { href: "/admin/approvals", label: "Approvals" },
    { href: "/admin/reports", label: "Reports" },
    { href: "/admin/moderation", label: "Moderation" },
    { href: "/admin/school", label: "School settings" },
    ...own("SCHOOL_ADMIN"),
  ],
  SUPER_ADMIN: [
    { href: "/platform", label: "Overview" },
    { href: "/platform/schools", label: "Schools" },
    { href: "/platform/ai-usage", label: "AI usage" },
    { href: "/platform/moderation", label: "Moderation" },
    { href: "/platform/audit", label: "Audit log" },
    ...own("SUPER_ADMIN"),
  ],
};

/** Unread notification and message counts plus the signed-in user's display prefs. */
async function shellData(role: Role) {
  const s = await getSession();
  if (!s) return { unread: 0, unreadMessages: 0, cls: "" };
  const [user, unread, unreadMessages] = await Promise.all([
    db.user.findUnique({ where: { id: s.userId }, select: { prefs: true } }),
    db.notification.count({ where: { userId: s.userId, readAt: null } }),
    role === "TEACHER" || role === "PARENT"
      ? db.message.count({ where: { toId: s.userId, readAt: null, held: false, ...(s.schoolId ? { schoolId: s.schoolId } : {}) } })
      : Promise.resolve(0),
  ]);
  return { unread, unreadMessages, cls: prefClasses(readPrefs(user?.prefs)) };
}

export async function AppShell({
  role, name, schoolName, children,
}: { role: Role; name: string; schoolName: string | null; children: React.ReactNode }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  const { unread, unreadMessages, cls } = await shellData(role);
  const home = ROLE_HOME[role];
  const items = NAV[role];
  const badges: Record<string, number> = { [`${home}/notifications`]: unread, [`${home}/messages`]: unreadMessages };
  const brand = (
    <Link href={home} className="flex items-center gap-2.5 px-2 font-display text-xl font-bold">
      <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-gradient-to-br from-brand to-teal text-white"><Icon name="spark" /></span>
      Educop
    </Link>
  );
  const school = (
    <div className="rounded-[10px] bg-surface-2 p-2.5 text-xs">
      <div className="eyebrow">{schoolName ? "School" : "Platform"}</div>
      <b className="text-sm">{schoolName ?? "All schools"}</b>
      {schoolName && <div className="text-muted">Academic year 2026–27 · Term 1</div>}
    </div>
  );

  return (
    // pref-* classes switch on larger text / calm mode for the whole page (see globals.css).
    <div className={`min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)] ${cls}`}>
      <aside aria-label="Main navigation" className="sticky top-0 hidden h-screen flex-col gap-4 overflow-y-auto border-r border-line bg-surface px-3 py-4 lg:flex">
        {brand}
        {school}
        <NavLinks items={items} badges={badges} />
        <form action={logout} className="mt-auto"><button className="btn btn-sm w-full justify-start border-0"><Icon name="logout" /> Sign out</button></form>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur sm:px-5">
          <MobileNav items={items} badges={badges} brand={brand} school={school} />
          <PageTitle items={items} />
          <Link href={`${home}/notifications`} className="relative grid h-[38px] w-[38px] flex-none place-items-center rounded-[10px] border border-line bg-surface hover:bg-surface-2"
            aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
            <Icon name="bell" />
            {unread > 0 && <span aria-hidden="true" className="tnum absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full border-2 border-bg bg-bad px-1 text-center text-[10px] font-bold leading-[14px] text-white">{unread > 99 ? "99+" : unread}</span>}
          </Link>
          <UserMenu name={name} initials={initials} sub={`${ROLE_LABEL[role]}${schoolName ? ` · ${schoolName}` : ""}`} settingsHref={`${home}/settings`} logout={logout} />
        </header>
        <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
