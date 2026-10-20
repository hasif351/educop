import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { teacherAssignments } from "@/lib/data";
import { Chip, Empty, PageHeader, fmtDate } from "@/components/ui";

export const metadata = { title: "Assignments" };

export default async function TeacherAssignments() {
  const s = await requireRole("TEACHER");
  const list = await teacherAssignments(s);
  return (
    <>
      <PageHeader eyebrow="Assessment" title="Assignments" actions={<Link className="btn-primary" href="/teacher/assignments/new">New assignment</Link>} />
      {list.length === 0 ? <Empty title="No assignments yet" body="Build one with multiple-choice and short-answer questions." href="/teacher/assignments/new" cta="New assignment" /> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="p-3">Assignment</th><th className="p-3">Class</th><th className="p-3">Due</th><th className="p-3">Status</th><th className="p-3">Handed in</th><th className="p-3">To mark</th></tr></thead>
            <tbody>
              {list.map((a) => {
                const handed = a.submissions.filter((x) => x.status !== "IN_PROGRESS").length;
                const toMark = a.submissions.filter((x) => x.status === "SUBMITTED").length;
                return (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="p-3"><Link className="font-bold hover:underline" href={`/teacher/assignments/${a.id}`}>{a.title}</Link><div className="text-xs text-muted">{a._count.questions} questions</div></td>
                    <td className="p-3">{a.class.name}</td>
                    <td className="tnum p-3">{fmtDate(a.dueAt)}</td>
                    <td className="p-3"><Chip tone={a.status === "PUBLISHED" ? "good" : "warn"}>{a.status === "PUBLISHED" ? "Published" : "Draft"}</Chip></td>
                    <td className="tnum p-3">{handed}/{a.class._count.enrollments}</td>
                    <td className="p-3">{toMark ? <Chip tone="warn">{toMark}</Chip> : <span className="text-muted">–</span>}</td>
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
