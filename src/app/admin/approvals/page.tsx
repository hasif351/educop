import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { pendingLessons, recentApprovalDecisions } from "@/lib/data-admin";
import { db } from "@/lib/db";
import { gradeLabel } from "@/lib/roster";
import { Chip, Empty, PageHeader, fmtDate, fmtTime } from "@/components/ui";
import { ActionButton } from "../_ui/ActionButton";
import { approveLesson } from "../actions";

export const metadata = { title: "Content approvals" };

export default async function Approvals({ searchParams }: { searchParams: Promise<{ returned?: string }> }) {
  const s = await requireRole("SCHOOL_ADMIN");
  const [lessons, recent, school] = await Promise.all([
    pendingLessons(s), recentApprovalDecisions(s),
    db.school.findUniqueOrThrow({ where: { id: s.schoolId }, select: { requireLessonApproval: true } }),
  ]);
  const { returned } = await searchParams;
  return (
    <>
      <PageHeader eyebrow="School administration" title="Content approvals"
        sub={school.requireLessonApproval ? "Lessons teachers publish wait here until you approve them." : "Approval is off: teachers publish directly. Lessons sent for approval still appear here."}
        actions={<Link className="btn" href="/admin/school">Approval setting</Link>} />
      {returned && <p role="status" className="rounded-lg bg-good-soft px-4 py-2 text-sm font-bold text-good">Returned to the teacher with your note.</p>}
      <section className="card">
        <div className="flex items-center justify-between gap-2"><h2 className="text-lg">Teacher content awaiting approval</h2><Chip tone={lessons.length ? "warn" : "good"}>{lessons.length} pending</Chip></div>
        {lessons.length === 0 ? <Empty title="All caught up" body="No lessons are waiting for approval." /> : (
          <ul className="flex flex-col divide-y divide-line">
            {lessons.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <b className="text-sm">{l.title}</b>
                  <div className="text-xs text-muted">{l.author.name} · {l.class.name} · {gradeLabel(l.class.gradeLevel)} · submitted {fmtDate(l.updatedAt, { day: "numeric", month: "short" })} · scheduled {fmtDate(l.scheduledFor)} {fmtTime(l.scheduledFor)}</div>
                </div>
                <Link className="btn btn-sm" href={`/admin/approvals/${l.id}`} aria-label={`Preview ${l.title}`}>Preview</Link>
                <ActionButton className="btn-primary btn-sm" action={approveLesson.bind(null, l.id)} label={`Approve ${l.title}`}>Approve</ActionButton>
                <Link className="btn btn-sm" href={`/admin/approvals/${l.id}#return`}>Request changes</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {recent.length > 0 && (
        <section className="card">
          <h2 className="text-lg">Recent decisions</h2>
          <ul className="flex flex-col gap-1.5 text-sm">{recent.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <span className="flex-1">{r.title} <span className="text-muted">· {r.actor?.name} · {fmtDate(r.createdAt, { day: "numeric", month: "short" })}</span></span>
              <Chip tone={r.action === "lesson.approve" ? "good" : "warn"}>{r.action === "lesson.approve" ? "Published" : "Changes requested"}</Chip>
            </li>
          ))}</ul>
        </section>
      )}
    </>
  );
}
