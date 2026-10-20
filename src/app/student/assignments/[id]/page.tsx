import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { studentAssignment } from "@/lib/data";
import { daysLate, lateCheck, percent } from "@/lib/grading";
import { Chip, fmtDate, fmtTime, scoreTone } from "@/components/ui";
import { AnswerForm } from "./AnswerForm";

export default async function AssignmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string }> }) {
  const s = await requireRole("STUDENT");
  const { id } = await params;
  const { submitted } = await searchParams;
  const a = await studentAssignment(s, id);
  const sub = a.submission;
  const locked = sub && sub.status !== "IN_PROGRESS";
  const late = daysLate(a.dueAt, new Date());
  const check = lateCheck(a, late);
  const pct = percent(sub?.finalScore, sub?.maxScore);
  const byQ = new Map(sub?.answers.map((x) => [x.questionId, x]) ?? []);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow"><Link className="hover:underline" href="/student/assignments">Assignments</Link> › {a.class.subject.name}</div>
          <h1 className="text-2xl">{a.title}</h1>
          <p className="text-muted">{a.class.teacher.name} · Due {fmtDate(a.dueAt)} at {fmtTime(a.dueAt)} · {a.questions.reduce((t, q) => t + q.points, 0)} points</p>
        </div>
        {sub?.status === "GRADED" && <Chip tone={scoreTone(pct)}>Score {sub.finalScore}/{sub.maxScore}{sub.daysLate ? ` (late −${sub.daysLate}d)` : ""}</Chip>}
        {sub?.status === "SUBMITTED" && <Chip tone="blue">Submitted · short answers being marked</Chip>}
      </div>

      {submitted && <p role="status" className="rounded-lg bg-good-soft px-4 py-3 font-bold text-good">Submitted. Your multiple-choice answers are marked already; your teacher will mark the rest.</p>}
      {a.instructions && <p className="card">{a.instructions}</p>}
      {!locked && late > 0 && (
        <p className={`rounded-lg px-4 py-3 text-sm font-bold ${check.accepted ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad"}`}>
          {check.accepted ? `This is ${late} day${late > 1 ? "s" : ""} late. A ${a.latePenaltyPerDay}% per day penalty applies.` : check.reason}
        </p>
      )}

      {locked ? (
        <section className="card gap-5">
          {sub.feedback && <div className="rounded-lg bg-teal-soft p-3 text-sm"><b>Teacher feedback:</b> {sub.feedback}</div>}
          {a.questions.map((q, i) => {
            const ans = byQ.get(q.id);
            const right = a.key.get(q.id);
            return (
              <div key={q.id} className="flex flex-col gap-2 border-b border-line pb-4 last:border-0">
                <div className="flex justify-between gap-3"><b>{i + 1}. {q.prompt}</b><span className="tnum text-xs text-muted">{q.type === "MCQ" ? `${ans?.autoScore ?? 0}` : ans?.teacherScore ?? "–"}/{q.points}</span></div>
                {q.type === "MCQ" ? (
                  <ul className="flex flex-col gap-1 text-sm">
                    {q.options.map((o, oi) => (
                      <li key={oi} className={`rounded-md px-2 py-1 ${oi === right ? "bg-good-soft font-bold" : oi === ans?.choiceIndex ? "bg-bad-soft" : ""}`}>
                        {o}{oi === ans?.choiceIndex ? " · your answer" : ""}{oi === right ? " · correct" : ""}
                      </li>
                    ))}
                  </ul>
                ) : <p className="rounded-md bg-surface-2 p-2 text-sm">{ans?.text}</p>}
              </div>
            );
          })}
          {a.lesson && <Link className="btn self-start" href={`/student/lessons/${a.lesson.id}`}>Review the lesson: {a.lesson.title}</Link>}
        </section>
      ) : (
        <AnswerForm
          assignmentId={a.id}
          canSubmit={check.accepted}
          questions={a.questions.map((q) => ({ ...q, saved: byQ.get(q.id) ? { choiceIndex: byQ.get(q.id)!.choiceIndex, text: byQ.get(q.id)!.text } : null }))}
        />
      )}
    </>
  );
}
