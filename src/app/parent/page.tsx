import { requireRole } from "@/lib/auth";
import { parentChildren } from "@/lib/data";
import { percent } from "@/lib/grading";
import { Chip, Empty, PageHeader, fmtDate, scoreTone } from "@/components/ui";

export const metadata = { title: "My children" };

export default async function ParentHome() {
  const s = await requireRole("PARENT");
  const kids = await parentChildren(s);
  return (
    <>
      <PageHeader eyebrow="Parent portal" title={`Hello, ${s.name.split(" ")[0]}`} sub="Upcoming work and recent results for each child. The full parent portal comes in a later phase." />
      {kids.length === 0 && <Empty title="No linked children yet" body="Your school verifies parent–child links. Contact the school office if a child is missing." />}
      {kids.map(({ student, pending, graded }) => (
        <section key={student.id} className="card">
          <div className="flex items-center justify-between"><h2 className="text-lg">{student.name}</h2><Chip tone="blue">{student.gradeLevel != null && student.gradeLevel > 0 ? `Grade ${student.gradeLevel}` : "KG"}</Chip></div>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm">Coming up</h3>
              {pending.length === 0 ? <p className="text-sm text-muted">Nothing due.</p> : (
                <ul className="flex flex-col gap-2 text-sm">{pending.map((a) => <li key={a.id} className="flex justify-between gap-2"><span>{a.title} <span className="text-muted">· {a.class.name}</span></span><span className="tnum text-muted">{fmtDate(a.dueAt)}</span></li>)}</ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm">Recent results</h3>
              {graded.length === 0 ? <p className="text-sm text-muted">No marked work yet.</p> : (
                <ul className="flex flex-col gap-2 text-sm">{graded.map((g) => <li key={g.id} className="flex flex-col gap-0.5"><div className="flex justify-between gap-2"><span>{g.assignment.title}</span><Chip tone={scoreTone(percent(g.finalScore, g.maxScore))}>{g.finalScore}/{g.maxScore}</Chip></div>{g.feedback && <span className="text-xs text-muted">Teacher: {g.feedback}</span>}</li>)}</ul>
              )}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
