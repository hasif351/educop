import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { adminOverview } from "@/lib/data-admin";
import { attentionReasons } from "@/lib/reports";
import { ROLE_LABEL } from "@/lib/roles";
import { Bar, Chip, Empty, PageHeader, fmtDate, fmtTime, scoreTone } from "@/components/ui";

export const metadata = { title: "School overview" };

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="tnum font-display text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export default async function AdminHome() {
  const s = await requireRole("SCHOOL_ADMIN");
  const d = await adminOverview(s);
  const attention = d.classes.map((c) => ({ c, reasons: attentionReasons(c) })).filter((x) => x.reasons.length > 0);
  const studentShare = d.students ? Math.round((d.studentsActiveToday / d.students) * 100) : 0;
  return (
    <>
      <PageHeader eyebrow="School administration" title={d.school.name}
        sub={`${[d.school.city, d.school.organization.name].filter(Boolean).join(" · ")} · ${d.school.curriculum} curriculum · ${d.students} students`}
        actions={<Link className="btn" href="/admin/reports">School report</Link>} />

      {(d.pendingApprovals > 0 || d.openModeration > 0 || d.pendingLinks > 0) && (
        <div className="flex flex-wrap gap-2" aria-label="Waiting for you">
          {d.pendingApprovals > 0 && <Link className="btn btn-sm" href="/admin/approvals">Content approvals <Chip tone="warn">{d.pendingApprovals}</Chip></Link>}
          {d.openModeration > 0 && <Link className="btn btn-sm" href="/admin/moderation">Moderation <Chip tone="warn">{d.openModeration}</Chip></Link>}
          {d.pendingLinks > 0 && <Link className="btn btn-sm" href="/admin/users#links">Parent links to verify <Chip tone="warn">{d.pendingLinks}</Chip></Link>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Students" value={d.students} sub={`${d.parents} parents`} />
        <Kpi label="Teachers" value={d.teachers} />
        <Kpi label="Active today" value={d.activeToday} sub={`${studentShare}% of students`} />
        <Kpi label="Lessons published" value={d.lessonsThisWeek} sub="this week" />
        <Kpi label="Assignments submitted" value={d.submittedThisWeek} sub="this week" />
        <Kpi label="Average score" value={d.avgScore == null ? "–" : `${d.avgScore}%`} sub={`${d.gradedCount} marked pieces of work`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <div className="flex items-center justify-between gap-2"><h2 className="text-lg">Classes needing attention</h2><Link className="btn btn-sm" href="/admin/reports">All classes</Link></div>
          {attention.length === 0 ? <Empty title="Nothing stands out" body="Every class is above 60% average and 75% completion of due work." /> : (
            <ul className="flex flex-col divide-y divide-line">
              {attention.map(({ c, reasons }) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <Link className="font-bold hover:underline" href={`/admin/classes/${c.id}`}>{c.name}</Link>
                    <div className="text-xs text-muted">{c.teacher} · {c.students} students</div>
                  </div>
                  <div className="flex flex-wrap gap-1">{reasons.map((r) => <Chip key={r} tone="warn">{r}</Chip>)}</div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">Flags are simple thresholds to start a conversation with the teacher, not a judgement on the class.</p>
        </section>

        <section className="card lg:col-span-2">
          <h2 className="text-lg">Teacher activity</h2>
          {d.teacherActivity.length === 0 ? <p className="text-sm text-muted">No teachers yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-3">Teacher</th><th className="py-2 pr-3">Lessons</th><th className="py-2 pr-3">Assignments</th><th className="py-2">Last active</th></tr></thead>
                <tbody>{d.teacherActivity.map((t) => (
                  <tr key={t.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 font-bold">{t.name}</td><td className="tnum py-2 pr-3">{t._count.createdLessons}</td><td className="tnum py-2 pr-3">{t._count.createdAssigns}</td>
                    <td className="tnum py-2 text-muted">{t.lastLoginAt ? fmtDate(t.lastLoginAt, { day: "numeric", month: "short" }) : "Never"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="text-lg">Average score by class</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {d.classes.map((c) => (
            <li key={c.id} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate">{c.name}</span>
              <Bar value={c.avgPct ?? 0} />
              {c.avgPct == null ? <span className="w-12 text-xs text-muted">No marks</span> : <span className="w-12"><Chip tone={scoreTone(c.avgPct)}>{c.avgPct}%</Chip></span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="text-lg">Recent activity</h2>
        <ul className="flex flex-col gap-1.5 text-sm">{d.recentAudit.length === 0 ? <li className="text-muted">No activity yet.</li> : d.recentAudit.map((a) => (
          <li key={a.id} className="flex flex-wrap gap-2">
            <span className="tnum w-32 text-muted">{fmtDate(a.createdAt, { day: "numeric", month: "short" })} {fmtTime(a.createdAt)}</span>
            <b>{a.actor?.name ?? "System"}</b>{a.actor && <span className="text-muted">{ROLE_LABEL[a.actor.role]}</span>}<span>{a.action}</span>
          </li>
        ))}</ul>
      </section>
    </>
  );
}
