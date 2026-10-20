import { requireRole } from "@/lib/auth";
import { schoolOverview } from "@/lib/data";
import { ROLE_LABEL } from "@/lib/roles";
import { PageHeader, fmtDate, fmtTime } from "@/components/ui";

export const metadata = { title: "School overview" };

export default async function AdminHome() {
  const s = await requireRole("SCHOOL_ADMIN");
  const { school, counts, classes, recentAudit } = await schoolOverview(s);
  return (
    <>
      <PageHeader eyebrow={school.organization.name} title={school.name} sub={`${school.city ?? ""} · ${school.curriculum} curriculum · Full admin tools (users, curriculum, approvals) come in a later phase.`} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {counts.map((c) => <div key={c.role} className="rounded-card border border-line bg-surface p-4"><div className="text-xs text-muted">{ROLE_LABEL[c.role]}s</div><div className="tnum font-display text-2xl font-semibold">{c._count}</div></div>)}
      </div>
      <section className="card overflow-x-auto">
        <h2 className="text-lg">Classes</h2>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-3">Class</th><th className="py-2 pr-3">Teacher</th><th className="py-2 pr-3">Students</th><th className="py-2 pr-3">Lessons</th><th className="py-2">Assignments</th></tr></thead>
          <tbody>{classes.map((c) => <tr key={c.id} className="border-b border-line last:border-0"><td className="py-2.5 pr-3 font-bold">{c.name}</td><td className="py-2.5 pr-3">{c.teacher.name}</td><td className="tnum py-2.5 pr-3">{c._count.enrollments}</td><td className="tnum py-2.5 pr-3">{c._count.lessons}</td><td className="tnum py-2.5">{c._count.assignments}</td></tr>)}</tbody>
        </table>
      </section>
      <section className="card">
        <h2 className="text-lg">Recent activity (audit log)</h2>
        <ul className="flex flex-col gap-1.5 text-sm">{recentAudit.length === 0 ? <li className="text-muted">No activity yet.</li> : recentAudit.map((a) => <li key={a.id} className="flex flex-wrap gap-2"><span className="tnum w-28 text-muted">{fmtDate(a.createdAt)} {fmtTime(a.createdAt)}</span><b>{a.actor?.name ?? "System"}</b><span>{a.action}</span></li>)}</ul>
      </section>
    </>
  );
}
