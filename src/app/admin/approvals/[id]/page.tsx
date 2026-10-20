import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { approvalLesson } from "@/lib/data-admin";
import { gradeLabel } from "@/lib/roster";
import { Chip, PageHeader, fmtDate, fmtTime } from "@/components/ui";
import { ActionButton } from "../../_ui/ActionButton";
import { ActionForm } from "../../_ui/ActionForm";
import { approveLesson, returnLesson } from "../../actions";

export const metadata = { title: "Lesson preview" };

type KC = { prompt: string; options: string[]; answerIndex: number; hint?: string; explanation?: string };

export default async function ApprovalPreview({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("SCHOOL_ADMIN");
  const { id } = await params;
  const l = await approvalLesson(s, id);
  const kc = (Array.isArray(l.knowledgeCheck) ? l.knowledgeCheck : []) as KC[];
  const pending = l.status === "PENDING_APPROVAL";
  const part = (n: number, title: string, body: string) => (
    <section className="flex flex-col gap-1.5 border-b border-line pb-4 last:border-0">
      <h2 className="text-base">{n}. {title}</h2>
      {body.trim() ? <p className="whitespace-pre-wrap text-sm">{body}</p> : <p className="text-sm italic text-muted">Not filled in.</p>}
    </section>
  );
  return (
    <>
      <PageHeader eyebrow={`Approvals › ${l.class.name}`} title={l.title}
        sub={`${l.author.name} · ${l.class.subject.name} · ${gradeLabel(l.class.gradeLevel)} · ${fmtDate(l.scheduledFor)} ${fmtTime(l.scheduledFor)} · ${l.durationMin} min${l.outcomeCode ? ` · ${l.outcomeCode}` : ""}`}
        actions={<><Chip tone={pending ? "warn" : "plain"}>{pending ? "Waiting for approval" : l.status === "PUBLISHED" ? "Published" : l.status === "DRAFT" ? "Draft" : "Archived"}</Chip><Link className="btn" href="/admin/approvals">Back</Link></>} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <article className="card gap-4" aria-label="Read-only lesson preview">
          <section className="flex flex-col gap-1.5 border-b border-line pb-4">
            <h2 className="text-base">1. Learning objectives</h2>
            <ul className="list-disc pl-5 text-sm">{l.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
          </section>
          {part(2, "Introduction", l.introduction)}
          {part(3, "Explanation & examples", l.explanation)}
          {part(4, "Interactive activity", l.activity)}
          <section className="flex flex-col gap-2 border-b border-line pb-4">
            <h2 className="text-base">5. Knowledge check</h2>
            {kc.length === 0 ? <p className="text-sm italic text-muted">No questions.</p> : kc.map((q, i) => (
              <div key={i} className="rounded-lg bg-surface-2 p-3 text-sm">
                <b>{q.prompt}</b>
                <ul className="mt-1 flex flex-col gap-0.5">{q.options.map((o, j) => <li key={j} className={j === q.answerIndex ? "font-bold text-good" : ""}>{j === q.answerIndex ? "✓ " : "· "}{o}</li>)}</ul>
                {q.hint && <p className="mt-1 text-xs text-muted">Hint: {q.hint}</p>}
              </div>
            ))}
          </section>
          {part(6, "Practice worksheet", l.worksheet)}
          <p className="border-b border-line pb-4 text-sm"><b>7. Assessment:</b> assignments are linked from the assignment builder.</p>
          {part(8, "Recommended next activity", l.nextActivity)}
        </article>
        <aside className="flex flex-col gap-4 self-start lg:sticky lg:top-20">
          {pending ? (
            <>
              <section className="card">
                <h2 className="text-lg">Approve</h2>
                <p className="text-sm text-muted">Publishes the lesson now. Students see it at its scheduled time.</p>
                <ActionButton className="btn-primary self-start" action={approveLesson.bind(null, l.id)}>Approve and publish</ActionButton>
              </section>
              <section id="return" className="card scroll-mt-24">
                <h2 className="text-lg">Request changes</h2>
                <ActionForm action={returnLesson.bind(null, l.id)} submit="Return to teacher">
                  <label className="label">Note for {l.author.name}<textarea className="input" name="note" rows={4} required maxLength={1000} placeholder="What should change before this is published?" /></label>
                </ActionForm>
                <p className="text-xs text-muted">The lesson goes back to draft and the teacher is notified with your note.</p>
              </section>
            </>
          ) : <p className="card text-sm text-muted">This lesson isn&apos;t waiting for approval.</p>}
        </aside>
      </div>
    </>
  );
}
