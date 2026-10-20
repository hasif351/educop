import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { platformModeration } from "@/lib/data-platform";
import { Chip, Empty, PageHeader, fmtDate, fmtTime } from "@/components/ui";
import { ActionButton } from "@/app/admin/_ui/ActionButton";
import { KIND_LABEL } from "@/app/admin/_ui/labels";
import { closePlatformModeration } from "../actions";

export const metadata = { title: "Moderation" };

export default async function PlatformModeration({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireRole("SUPER_ADMIN");
  const view = (await searchParams).view === "closed" ? "CLOSED" : "OPEN";
  const items = await platformModeration(view);
  return (
    <>
      <PageHeader eyebrow="Platform administration" title="Content moderation queue" sub="All schools. You see the summary only; the school's admin reviews the content itself." />
      <nav className="flex gap-2" aria-label="Moderation view">
        <Link className={view === "OPEN" ? "btn-primary btn-sm" : "btn btn-sm"} href="/platform/moderation" aria-current={view === "OPEN" ? "page" : undefined}>Open</Link>
        <Link className={view === "CLOSED" ? "btn-primary btn-sm" : "btn btn-sm"} href="/platform/moderation?view=closed" aria-current={view === "CLOSED" ? "page" : undefined}>Resolved</Link>
      </nav>
      <section className="card">
        <div className="flex items-center justify-between gap-2"><h2 className="text-lg">{view === "OPEN" ? "Open items" : "Resolved items"}</h2>{view === "OPEN" && <Chip tone={items.length ? "warn" : "good"}>{items.length} open</Chip>}</div>
        {items.length === 0 ? <Empty title="Nothing here" body="Flags from every school appear here." /> : (
          <ul className="flex flex-col divide-y divide-line">
            {items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <b className="text-sm">{i.summary}</b>
                  <div className="text-xs text-muted">{i.school} · {KIND_LABEL[i.kind] ?? i.kind} · {fmtDate(i.createdAt, { day: "numeric", month: "short" })} {fmtTime(i.createdAt)}</div>
                </div>
                {i.status === "OPEN" ? (
                  <>
                    <ActionButton className="btn-primary btn-sm" action={closePlatformModeration.bind(null, i.id, "RESOLVED")} label={`Resolve: ${i.summary}`}>Resolve</ActionButton>
                    <ActionButton action={closePlatformModeration.bind(null, i.id, "DISMISSED")} label={`Dismiss: ${i.summary}`}>Dismiss</ActionButton>
                  </>
                ) : <Chip tone={i.status === "RESOLVED" ? "good" : "plain"}>{i.status === "RESOLVED" ? "Resolved" : "Dismissed"}</Chip>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
