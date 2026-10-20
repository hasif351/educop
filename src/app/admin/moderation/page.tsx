import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { schoolModeration } from "@/lib/data-admin";
import { ROLE_LABEL } from "@/lib/roles";
import { Chip, Empty, PageHeader, fmtDate, fmtTime } from "@/components/ui";
import { ActionButton } from "../_ui/ActionButton";
import { closeModeration, decideHeldMessage } from "../actions";
import { KIND_LABEL } from "../_ui/labels";

export const metadata = { title: "Moderation" };


export default async function Moderation({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const s = await requireRole("SCHOOL_ADMIN");
  const view = (await searchParams).view === "closed" ? "CLOSED" : "OPEN";
  const items = await schoolModeration(s, view);
  return (
    <>
      <PageHeader eyebrow="School administration" title="Moderation" sub="Held messages, AI flags and deletion requests for your school. Every decision is logged." />
      <nav className="flex gap-2" aria-label="Moderation view">
        <Link className={view === "OPEN" ? "btn-primary btn-sm" : "btn btn-sm"} href="/admin/moderation" aria-current={view === "OPEN" ? "page" : undefined}>Open</Link>
        <Link className={view === "CLOSED" ? "btn-primary btn-sm" : "btn btn-sm"} href="/admin/moderation?view=closed" aria-current={view === "CLOSED" ? "page" : undefined}>Resolved</Link>
      </nav>
      {items.length === 0 ? <Empty title={view === "OPEN" ? "Nothing to review" : "No resolved items yet"} body={view === "OPEN" ? "New held messages and flags appear here." : "Resolved and dismissed items appear here."} /> : (
        <ul className="flex flex-col gap-4">
          {items.map((i) => (
            <li key={i.id} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={i.kind === "message" ? "warn" : i.kind === "ai_reply" ? "blue" : "plain"}>{KIND_LABEL[i.kind] ?? i.kind}</Chip>
                <b className="min-w-0 flex-1 text-sm">{i.summary}</b>
                <span className="tnum text-xs text-muted">{fmtDate(i.createdAt, { day: "numeric", month: "short" })} {fmtTime(i.createdAt)}</span>
              </div>
              {i.message && (
                <div className="rounded-lg bg-surface-2 p-3 text-sm">
                  <div className="text-xs text-muted">From {i.message.from.name} ({ROLE_LABEL[i.message.from.role]}) to {i.message.to.name} ({ROLE_LABEL[i.message.to.role]}) · {i.message.held ? "hidden from recipient" : "delivered"}</div>
                  <p className="mt-1 whitespace-pre-wrap">{i.message.body}</p>
                </div>
              )}
              {i.chat && (
                <div className="rounded-lg bg-surface-2 p-3 text-sm">
                  <div className="text-xs text-muted">Live class chat · {i.chat.session.title} · {i.chat.user.name} · {i.chat.held ? "hidden from class" : "shown"}</div>
                  <p className="mt-1 whitespace-pre-wrap">{i.chat.body}</p>
                </div>
              )}
              {i.ai && (
                <div className="rounded-lg bg-surface-2 p-3 text-sm">
                  <div className="text-xs text-muted">Flagged {i.ai.role === "assistant" ? "AI study buddy reply" : "student message"}</div>
                  <p className="mt-1 whitespace-pre-wrap">{i.ai.content}</p>
                </div>
              )}
              {(i.kind === "deletion" || i.summary.startsWith("Account deletion request")) && i.status === "OPEN" && <p className="text-xs text-muted">Carry out the deletion in the relevant tool first, then resolve this request so it&apos;s recorded.</p>}
              {i.status === "OPEN" ? (
                <div className="flex flex-wrap gap-2">
                  {i.message ? (
                    <>
                      <ActionButton className="btn-primary btn-sm" action={decideHeldMessage.bind(null, i.id, true)} label="Release message">Release message</ActionButton>
                      <ActionButton action={decideHeldMessage.bind(null, i.id, false)} label="Keep hidden">Keep hidden</ActionButton>
                    </>
                  ) : (
                    <>
                      <ActionButton className="btn-primary btn-sm" action={closeModeration.bind(null, i.id, "RESOLVED")} label={`Resolve: ${i.summary}`}>Resolve</ActionButton>
                      <ActionButton action={closeModeration.bind(null, i.id, "DISMISSED")} label={`Dismiss: ${i.summary}`}>Dismiss</ActionButton>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted"><Chip tone={i.status === "RESOLVED" ? "good" : "plain"}>{i.status === "RESOLVED" ? "Resolved" : "Dismissed"}</Chip> {i.resolvedBy ? `by ${i.resolvedBy}` : ""} {i.resolvedAt ? `· ${fmtDate(i.resolvedAt, { day: "numeric", month: "short" })}` : ""}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
