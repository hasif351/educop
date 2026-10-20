import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { studentAssignments } from "@/lib/data";
import { percent } from "@/lib/grading";
import { Chip, Empty, PageHeader, fmtDate, scoreTone } from "@/components/ui";

export const metadata = { title: "Assignments" };

export default async function AssignmentsPage() {
  const s = await requireRole("STUDENT");
  const list = await studentAssignments(s);
  const now = new Date();
  return (
    <>
      <PageHeader eyebrow="Assignments" title="My assignments" />
      {list.length === 0 ? <Empty title="No assignments yet" body="When your teachers set work, it will appear here." /> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="p-3">Assignment</th><th className="p-3">Subject</th><th className="p-3">Due</th><th className="p-3">Status</th></tr></thead>
            <tbody>
              {list.map((a) => {
                const sub = a.submissions[0];
                const pct = percent(sub?.finalScore, sub?.maxScore);
                const status = sub?.status === "GRADED" ? <Chip tone={scoreTone(pct)}>{sub.finalScore}/{sub.maxScore}</Chip>
                  : sub?.status === "SUBMITTED" ? <Chip tone="blue">Submitted, being marked</Chip>
                  : a.dueAt < now ? <Chip tone="bad">Overdue</Chip>
                  : sub ? <Chip tone="warn">Draft saved</Chip> : <Chip>To do</Chip>;
                return (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="p-3"><Link className="font-bold hover:underline" href={`/student/assignments/${a.id}`}>{a.title}</Link><div className="text-xs text-muted">{a._count.questions} questions</div></td>
                    <td className="p-3">{a.class.subject.name}</td>
                    <td className="tnum p-3">{fmtDate(a.dueAt)}</td>
                    <td className="p-3">{status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
