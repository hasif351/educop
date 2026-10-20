"use client";
import { keepValues } from "@/components/submit";
import { useActionState } from "react";
import { saveOrSubmit, type SubmitState } from "@/app/student/actions";

type Q = { id: string; type: "MCQ" | "SHORT"; prompt: string; options: string[]; points: number; saved: { choiceIndex: number | null; text: string | null } | null };

export function AnswerForm({ assignmentId, questions, canSubmit }: { assignmentId: string; questions: Q[]; canSubmit: boolean }) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(saveOrSubmit.bind(null, assignmentId), {});
  return (
    <form onSubmit={keepValues(action)} className="card gap-6">
      {questions.map((q, i) => (
        <fieldset key={q.id} className="flex flex-col gap-2">
          <legend className="mb-2 flex w-full justify-between gap-3 font-bold"><span>{i + 1}. {q.prompt}</span><span className="tnum text-xs font-normal text-muted">{q.points} pt{q.points > 1 ? "s" : ""}</span></legend>
          {q.type === "MCQ" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {q.options.map((o, oi) => (
                <label key={oi} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2.5 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                  <input type="radio" name={`q_${q.id}`} value={oi} defaultChecked={q.saved?.choiceIndex === oi} /> {o}
                </label>
              ))}
            </div>
          ) : (
            <textarea className="input min-h-28" name={`q_${q.id}`} defaultValue={q.saved?.text ?? ""} maxLength={5000} aria-label={`Answer to question ${i + 1}`} />
          )}
        </fieldset>
      ))}
      {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>}
      {state.saved && <p role="status" className="text-sm font-bold text-good">Draft saved.</p>}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <button className="btn" name="intent" value="save" disabled={pending}>Save draft</button>
        <button className="btn-primary" name="intent" value="submit" disabled={pending || !canSubmit}>{pending ? "Working…" : "Submit answers"}</button>
      </div>
    </form>
  );
}
