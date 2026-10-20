"use client";
import { keepValues } from "@/components/submit";
import { useActionState } from "react";
import { gradeSubmission, type FormState } from "@/app/teacher/actions";

type Item = { id: string; type: "MCQ" | "SHORT"; prompt: string; points: number; options: string[]; answerIndex: number | null; choiceIndex: number | null; text: string; autoScore: number | null; teacherScore: number | null };

export function GradeForm({ assignmentId, submissionId, items, feedback }: { assignmentId: string; submissionId: string; items: Item[]; feedback: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(gradeSubmission.bind(null, assignmentId, submissionId), {});
  return (
    <form onSubmit={keepValues(action)} className="card gap-5">
      {items.map((q, i) => (
        <div key={q.id} className="flex flex-col gap-2 border-b border-line pb-4">
          <div className="flex justify-between gap-3"><b>{i + 1}. {q.prompt}</b><span className="tnum text-xs text-muted">{q.points} pt{q.points > 1 ? "s" : ""}</span></div>
          {q.type === "MCQ" ? (
            <p className="text-sm">
              Answer: <b>{q.choiceIndex != null ? q.options[q.choiceIndex] : "No answer"}</b>{" "}
              <span className={q.autoScore ? "text-good" : "text-bad"}>{q.autoScore ? "· correct" : `· correct answer: ${q.answerIndex != null ? q.options[q.answerIndex] : "–"}`}</span>
              <span className="tnum ml-2 text-muted">(auto-marked {q.autoScore ?? 0}/{q.points})</span>
            </p>
          ) : (
            <>
              <p className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm">{q.text || <i className="text-muted">No answer</i>}</p>
              <label className="flex items-center gap-2 text-sm font-bold">Score
                <input className="input w-20" type="number" name={`score_${q.id}`} min={0} max={q.points} step={0.5} defaultValue={q.teacherScore ?? ""} required />
                <span className="font-normal text-muted">/ {q.points}</span>
              </label>
            </>
          )}
        </div>
      ))}
      <label className="label">Feedback for the student<textarea className="input" name="feedback" rows={3} defaultValue={feedback} placeholder="What went well, and one next step." /></label>
      {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>}
      <button className="btn-primary self-start" disabled={pending}>{pending ? "Saving…" : "Save marks & feedback"}</button>
    </form>
  );
}
