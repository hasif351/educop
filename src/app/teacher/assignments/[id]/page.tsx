import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { teacherAssignment } from "@/lib/data";
import { percent } from "@/lib/grading";
import { Bar, Chip, PageHeader, fmtDate, fmtTime, scoreTone } from "@/components/ui";
import { PublishButton } from "./PublishButton";

export default async function AssignmentDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ graded?: string }> }) {
  const s = await requireRole("TEACHER");
  const { id } = await params;
  const { graded } = await searchParams;
  const a = await teacherAssignment(s, id);
  const subs = new Map(a.submissions.map((x) => [x.studentId, x]));
  const handedIn = a.submissions.filter((x) => x.status !== "IN_PROGRESS");
  const done = a.submissions.filter((x) => x.status === "GRADED");
  const avg = percent(done.reduce((t, x) => t + (x.finalScore ?? 0), 0), done.reduce((t, x) => t + (x.maxScore ?? 0), 0));
  const total = a.questions.reduce((t, q) => t + q.points, 0);

  return (
    <>
      <PageHeader
        eyebrow={`Assignments › ${a.class.name}`}
        title={a.title}
        sub={`Due ${fmtDate(a.dueAt)} at ${fmtTime(a.dueAt)} · ${a.questions.length} questions · ${total} points${a.lesson ? ` · linked to “${a.lesson.title}”` : ""}`}
        actions={a.status === "DRAFT" ? <><Link className="btn" href={`/teacher/assignments/${a.id}/edit`}>Edit</Link><PublishButton id={a.id} /></> : <Chip tone="good">Published</Chip>}
      />
      {graded && <p role="status" className="rounded-lg bg-good-soft px-4 py-2 text-sm font-bold text-good">Marks saved and shared with the student.</p>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[["Handed in", `${handedIn.length}/${a.class.enrollments.length}`], ["Marked", `${done.length}`], ["Waiting for you", `${handedIn.length - done.length}`], ["Class average", avg == null ? "–" : `${avg}%`]].map(([l, v]) => (
          <div key={l} className="rounded-card border border-line bg-surface p-4"><div className="text-xs text-muted">{l}</div><div className="tnum font-display text-2xl font-semibold">{v}</div></div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card overflow-x-auto">
          <h2 className="text-lg">Gradebook</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-3">Student</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Score</th><th className="py-2"></th></tr></thead>
            <tbody>
              {a.class.enrollments.map(({ student }) => {
                const sub = subs.get(student.id);
                const pct = percent(sub?.finalScore, sub?.maxScore);
                const status = !sub || sub.status === "IN_PROGRESS" ? (a.dueAt < new Date() ? <Chip tone="bad">Missing</Chip> : <Chip>Not handed in</Chip>)
                  : sub.status === "SUBMITTED" ? <Chip tone="warn">Needs marking</Chip> : <Chip tone="good">Marked</Chip>;
                return (
                  <tr key={student.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 font-bold">{student.name}{sub?.daysLate ? <span className="ml-2 text-xs font-normal text-warn">{sub.daysLate}d late</span> : null}</td>
                    <td className="py-2.5 pr-3">{status}</td>
                    <td className="tnum py-2.5 pr-3">{sub?.status === "GRADED" ? <Chip tone={scoreTone(pct)}>{sub.finalScore}/{sub.maxScore}</Chip> : sub?.status === "SUBMITTED" ? <span className="text-muted">{sub.rawScore}/{sub.maxScore} so far</span> : "–"}</td>
                    <td className="py-2.5 text-right">{sub && sub.status !== "IN_PROGRESS" && <Link className={sub.status === "SUBMITTED" ? "btn-primary btn-sm" : "btn btn-sm"} href={`/teacher/assignments/${a.id}/submissions/${sub.id}`}>{sub.status === "SUBMITTED" ? "Mark" : "View"}</Link>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2 className="text-lg">Question analysis</h2>
          <p className="text-xs text-muted">Share of students who got each multiple-choice question right.</p>
          <ul className="flex flex-col gap-3">
            {a.questions.map((q, i) => {
              const n = q.answers.length;
              const right = q.answers.filter((x) => (x.autoScore ?? 0) > 0).length;
              const p = n ? Math.round((right / n) * 100) : null;
              return (
                <li key={q.id} className="flex flex-col gap-1 text-sm">
                  <div className="flex justify-between gap-2"><span className="min-w-0"><b>Q{i + 1}.</b> {q.prompt}</span>{p != null && p < 50 && q.type === "MCQ" && <Chip tone="bad">Reteach</Chip>}</div>
                  {q.type === "MCQ" ? <div className="flex items-center gap-2"><Bar value={p ?? 0} tone={p != null && p < 50 ? "blue" : "teal"} /><span className="tnum w-20 text-right text-xs">{p == null ? "no answers" : `${p}% (${right}/${n})`}</span></div> : <span className="text-xs text-muted">Short answer, marked by you</span>}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}
