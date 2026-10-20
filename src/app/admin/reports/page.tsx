import { requireRole } from "@/lib/auth";
import { schoolReports } from "@/lib/data-admin";
import { Bar, Chip, Empty, PageHeader, scoreTone } from "@/components/ui";

export const metadata = { title: "Reports" };

const pctCell = (v: number | null) => (v == null ? <span className="text-muted">–</span> : <Chip tone={scoreTone(v)}>{v}%</Chip>);

export default async function Reports() {
  const s = await requireRole("SCHOOL_ADMIN");
  const { classes, subjects } = await schoolReports(s);
  return (
    <>
      <PageHeader eyebrow="School administration" title="School reports"
        sub="Average scores, completion of work that is already due, and late submissions. Class-level only: no individual student is ranked."
        actions={<a className="btn" href="/admin/reports/csv" download>Download CSV</a>} />
      {classes.length === 0 ? <Empty title="No classes yet" body="Reports appear once classes have published assignments." /> : (
        <>
          <section className="card overflow-x-auto">
            <h2 className="text-lg">By subject</h2>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-3">Subject</th><th className="py-2 pr-3">Classes</th><th className="py-2 pr-3">Students</th><th className="py-2 pr-3">Average score</th><th className="py-2 pr-3">Completion</th><th className="py-2 pr-3">Late</th><th className="py-2">Missing</th></tr></thead>
              <tbody>{subjects.map((r) => (
                <tr key={r.subject} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-3 font-bold">{r.subject}</td><td className="tnum py-2.5 pr-3">{r.classes}</td><td className="tnum py-2.5 pr-3">{r.students}</td>
                  <td className="py-2.5 pr-3">{pctCell(r.avgPct)}</td>
                  <td className="py-2.5 pr-3"><div className="flex min-w-[8rem] items-center gap-2"><Bar value={r.completionPct ?? 0} tone="teal" /><span className="tnum w-10 text-xs">{r.completionPct == null ? "–" : `${r.completionPct}%`}</span></div></td>
                  <td className="tnum py-2.5 pr-3">{r.late}</td><td className="tnum py-2.5">{r.missing}</td>
                </tr>
              ))}</tbody>
            </table>
          </section>
          <section className="card overflow-x-auto">
            <h2 className="text-lg">By class</h2>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-3">Class</th><th className="py-2 pr-3">Subject</th><th className="py-2 pr-3">Teacher</th><th className="py-2 pr-3">Students</th><th className="py-2 pr-3">Assignments</th><th className="py-2 pr-3">Average score</th><th className="py-2 pr-3">Completion</th><th className="py-2 pr-3">Late</th><th className="py-2">Missing</th></tr></thead>
              <tbody>{classes.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-3 font-bold">{r.name}</td><td className="py-2.5 pr-3">{r.subject}</td><td className="py-2.5 pr-3">{r.teacher}</td>
                  <td className="tnum py-2.5 pr-3">{r.students}</td><td className="tnum py-2.5 pr-3">{r.assignments}</td><td className="py-2.5 pr-3">{pctCell(r.avgPct)}</td>
                  <td className="tnum py-2.5 pr-3">{r.completionPct == null ? "–" : `${r.completionPct}%`}</td><td className="tnum py-2.5 pr-3">{r.late}</td><td className="tnum py-2.5">{r.missing}</td>
                </tr>
              ))}</tbody>
            </table>
            <p className="text-xs text-muted">Completion counts work handed in for assignments whose due date has passed. Missing = due work not yet handed in. Averages include the late penalty.</p>
          </section>
        </>
      )}
    </>
  );
}
