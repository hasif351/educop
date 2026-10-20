import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { teacherDashboard } from "@/lib/data";
import { db } from "@/lib/db";
import { percent } from "@/lib/grading";
import { classStats } from "@/lib/teacher-insights";
import { draftTitle, SOURCE_LABEL, type AiTool, type StoredDraft } from "@/lib/ai-teacher";
import { Bar, Chip, Empty, fmtDate, fmtTime } from "@/components/ui";
import { ReviewButtons } from "./ReviewButtons";

export const metadata = { title: "Teacher dashboard" };

export default async function TeacherDashboard() {
  const s = await requireRole("TEACHER");
  const [d, stats, drafts, draftCount] = await Promise.all([
    teacherDashboard(s),
    classStats(s),
    db.aiDraft.findMany({ where: { schoolId: s.schoolId, teacherId: s.userId, status: "DRAFT" }, orderBy: { createdAt: "desc" }, take: 3 }),
    db.aiDraft.count({ where: { schoolId: s.schoolId, teacherId: s.userId, status: "DRAFT" } }),
  ]);
  // Objectives with the lowest average across this teacher's classes.
  const attention = stats.flatMap((c) => c.objectives.filter((o) => o.avgPct != null).map((o) => ({ ...o, cls: c })))
    .sort((a, b) => a.avgPct! - b.avgPct!).slice(0, 3);
  const first = s.name.split(" ")[0];
  const students = d.classes.reduce((t, c) => t + c._count.enrollments, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">{fmtDate(new Date(), { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="text-2xl">Good morning, {first}</h1>
          <p className="text-muted">{d.today.length} lesson{d.today.length === 1 ? "" : "s"} today · {d.classes.length} classes · {students} students</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn" href="/teacher/ai">Plan with AI</Link>
          <Link className="btn" href="/teacher/lessons/new">New lesson</Link>
          <Link className="btn-primary" href="/teacher/assignments/new">New assignment</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[["Lessons today", d.today.length], ["To mark", d.toGrade.length], ["Suggestions to review", d.reviews.length], ["Students in my classes", students]].map(([l, v]) => (
          <div key={l} className="rounded-card border border-line bg-surface p-4"><div className="text-xs text-muted">{l}</div><div className="tnum font-display text-2xl font-semibold">{v}</div></div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card">
          <h2 className="text-lg">Today</h2>
          {d.today.length === 0 ? <Empty title="No lessons scheduled" body="Plan one for today." href="/teacher/lessons/new" cta="New lesson" /> : (
            <ul className="flex flex-col divide-y divide-line">
              {d.today.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 text-sm">
                  <span className="tnum w-12 text-muted">{fmtTime(l.scheduledFor)}</span>
                  <Link className="min-w-0 flex-1 hover:underline" href={`/teacher/lessons/${l.id}`}><b>{l.title}</b><div className="text-xs text-muted">{l.class.name}</div></Link>
                  {l.status === "DRAFT" && <Chip tone="warn">Draft</Chip>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between"><h2 className="text-lg">Waiting for marking</h2><Link className="btn btn-sm" href="/teacher/assignments">Gradebooks</Link></div>
          {d.toGrade.length === 0 ? <Empty title="Nothing to mark" body="Short answers that need your score will appear here." /> : (
            <ul className="flex flex-col divide-y divide-line">
              {d.toGrade.slice(0, 8).map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0 text-sm">
                  <div className="min-w-0 flex-1"><b>{g.student.name}</b><div className="text-xs text-muted">{g.assignment.title} · {g.assignment.class.name}</div></div>
                  {g.daysLate > 0 && <Chip tone="warn">{g.daysLate}d late</Chip>}
                  <Link className="btn-primary btn-sm" href={`/teacher/assignments/${g.assignment.id}/submissions/${g.id}`}>Mark</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card lg:col-span-2">
          <h2 className="text-lg">Recent assignments</h2>
          {d.recent.length === 0 ? <Empty title="No published assignments" body="Create one to see results here." href="/teacher/assignments/new" cta="New assignment" /> : (
            <ul className="flex flex-col divide-y divide-line">
              {d.recent.map((a) => {
                const graded = a.submissions.filter((x) => x.status === "GRADED");
                const avg = percent(graded.reduce((t, x) => t + (x.finalScore ?? 0), 0), graded.reduce((t, x) => t + (x.maxScore ?? 0), 0));
                const handedIn = a.submissions.filter((x) => x.status !== "IN_PROGRESS").length;
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0 text-sm">
                    <Link className="min-w-0 flex-1 hover:underline" href={`/teacher/assignments/${a.id}`}><b>{a.title}</b><div className="text-xs text-muted">{a.class.name} · due {fmtDate(a.dueAt)}</div></Link>
                    <span className="tnum text-xs text-muted">{handedIn}/{a.class._count.enrollments} handed in</span>
                    <div className="flex w-32 items-center gap-2"><Bar value={avg ?? 0} /><span className="tnum w-9 text-right text-xs">{avg == null ? "–" : `${avg}%`}</span></div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="flex items-center justify-between gap-2"><h2 className="text-lg">Suggestions to review</h2><Link className="btn btn-sm" href="/teacher/recommendations">All recommendations</Link></div>
          <p className="text-xs text-muted">Stretch activities wait for your approval before students see them.</p>
          {d.reviews.length === 0 ? <Empty title="All reviewed" body="New suggestions appear after marking." /> : (
            <ul className="flex flex-col gap-3">
              {d.reviews.map((r) => (
                <li key={r.id} className="flex flex-col gap-1.5 rounded-lg bg-surface-2 p-3 text-sm">
                  <b>{r.student.name}</b><span>{r.title}</span>
                  <span className="text-xs text-muted">{r.evidence[0]}</span>
                  <ReviewButtons id={r.id} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between gap-2"><h2 className="text-lg">Objectives needing attention</h2><Link className="btn btn-sm" href="/teacher/progress">Student progress</Link></div>
          {attention.length === 0 ? <Empty title="No objective data yet" body="Add outcome codes to lessons and link assignments to them to see mastery by objective." /> : (
            <ul className="flex flex-col divide-y divide-line">
              {attention.map((o) => (
                <li key={`${o.cls.id}-${o.code}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1"><b>{o.code} {o.title}</b><div className="text-xs text-muted">{o.cls.name} · {o.secure}/{o.withData} students secure</div></div>
                  <div className="flex w-32 items-center gap-2"><Bar value={o.avgPct!} /><span className="tnum w-9 text-right text-xs">{o.avgPct}%</span></div>
                  <Link className="btn btn-sm" href={`/teacher/progress?class=${o.cls.id}`}>Review</Link>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">Class average on each lesson outcome code, from marked work and knowledge checks.</p>
        </section>

        <section className="card">
          <div className="flex items-center justify-between gap-2"><h2 className="text-lg">AI drafts awaiting you</h2><Chip tone="blue">{draftCount}</Chip></div>
          {drafts.length === 0 ? <Empty title="No drafts waiting" body="Draft a lesson plan, quiz, feedback or parent note." /> : (
            <ul className="flex flex-col gap-2 text-sm">
              {drafts.map((x) => {
                const out = x.output as unknown as StoredDraft;
                return <li key={x.id}><Link className="font-bold hover:underline" href={`/teacher/ai/${x.id}`}>{draftTitle(x.tool as AiTool, out.content, out.input?.topic ?? "")}</Link><div className="text-xs text-muted">{SOURCE_LABEL[out.source] ?? SOURCE_LABEL.template}</div></li>;
              })}
            </ul>
          )}
          <Link className="btn btn-sm self-start" href="/teacher/ai">Open assistant</Link>
        </section>

        <section className="card">
          <h2 className="text-lg">My classes</h2>
          <ul className="flex flex-col divide-y divide-line text-sm">
            {stats.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <Link className="min-w-0 flex-1 hover:underline" href={`/teacher/progress?class=${c.id}`}><b>{c.name}</b><div className="text-xs text-muted">{c.students.length} students</div></Link>
                <span className="tnum text-xs">{c.avgPct == null ? "–" : `${c.avgPct}% avg`}</span>
              </li>
            ))}
          </ul>
          <Link className="btn btn-sm self-start" href="/teacher/progress">Student progress</Link>
        </section>

        <section className="card lg:col-span-2">
          <h2 className="text-lg">Students who may need support</h2>
          <p className="text-xs text-muted">From marked work below 60%. A starting point for a check-in, not a judgement.</p>
          {d.needsSupport.length === 0 ? <Empty title="No one flagged" body="Everyone's recent marked work is at 60% or above." /> : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {d.needsSupport.map((r) => (
                <li key={r.id} className="rounded-lg border border-line p-3 text-sm"><b>{r.student.name}</b><div className="text-xs text-muted">{r.evidence[0]}</div><div className="mt-1 text-xs">Suggested: {r.title}</div></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
