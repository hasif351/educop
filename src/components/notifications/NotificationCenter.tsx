import Link from "next/link";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/datetime";
import { ROLE_HOME } from "@/lib/roles";
import type { SessionPayload } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { MarkAllRead, NotificationActions } from "./NotificationButtons";

// One notification centre for every role; /<role>/notifications pages render it.

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "class", label: "Classes", kinds: ["class"] },
  { key: "assign", label: "Assignments", kinds: ["assign", "grade"] },
  { key: "message", label: "Messages", kinds: ["message"] },
  { key: "ai", label: "Recommendations", kinds: ["ai"] },
  { key: "school", label: "School", kinds: ["system"] },
] as const;

const KIND: Record<string, { icon: IconName; tone: string }> = {
  class: { icon: "video", tone: "bg-brand-soft text-brand" },
  assign: { icon: "clip", tone: "bg-warn-soft text-warn" },
  grade: { icon: "award", tone: "bg-good-soft text-good" },
  ai: { icon: "spark", tone: "bg-teal-soft text-teal" },
  message: { icon: "mail", tone: "bg-brand-soft text-brand" },
  system: { icon: "school", tone: "bg-surface-2 text-muted" },
};

export async function NotificationCenter({ s, filter }: { s: SessionPayload; filter?: string }) {
  const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
  const home = ROLE_HOME[s.role];
  const where = {
    userId: s.userId,
    ...(f.key === "unread" ? { readAt: null } : {}),
    ...("kinds" in f ? { kind: { in: [...f.kinds] } } : {}),
  };
  const [list, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
    db.notification.count({ where: { userId: s.userId, readAt: null } }),
  ]);
  const now = new Date();

  return (
    <>
      <PageHeader eyebrow="Notification center" title="Notifications" sub={`${unread} unread`}
        actions={<>
          {unread > 0 && <MarkAllRead />}
          <Link className="btn" href={`${home}/settings?tab=notifications`}><Icon name="gear" /> Preferences</Link>
        </>} />
      <nav aria-label="Filter notifications" className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {FILTERS.map((x) => (
          <Link key={x.key} href={x.key === "all" ? `${home}/notifications` : `${home}/notifications?filter=${x.key}`} aria-current={x.key === f.key ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-bold ${x.key === f.key ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-fg"}`}>
            {x.label}
          </Link>
        ))}
      </nav>
      {list.length === 0 ? (
        <div className="card items-center text-center">
          <span className="text-2xl text-muted"><Icon name="bell" /></span>
          <b>You&apos;re all caught up</b>
          <p className="text-sm text-muted">New notifications will appear here.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Notifications">
          {list.map((n) => {
            const k = KIND[n.kind] ?? KIND.system;
            return (
              <li key={n.id} className={`flex items-start gap-3 rounded-card border p-3.5 ${n.readAt ? "border-line bg-surface" : "border-brand bg-brand-soft/60"}`}>
                <span className={`grid h-9 w-9 flex-none place-items-center rounded-[10px] ${k.tone}`}><Icon name={k.icon} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <b>{!n.readAt && <span className="sr-only">Unread: </span>}{n.title}</b>
                    <span className="text-xs text-muted"><time dateTime={n.createdAt.toISOString()}>{timeAgo(n.createdAt, now)}</time></span>
                  </div>
                  {n.body && <p className="text-sm text-muted [overflow-wrap:anywhere]">{n.body}</p>}
                </div>
                <NotificationActions id={n.id} unread={!n.readAt} hasLink={!!n.href} title={n.title} />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
