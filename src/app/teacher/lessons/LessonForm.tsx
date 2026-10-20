"use client";
import { keepValues } from "@/components/submit";
import { useActionState, useState } from "react";
import { saveLesson, type FormState } from "../actions";

type KC = { prompt: string; options: string[]; answerIndex: number; hint: string; explanation: string };
export type LessonDefaults = {
  classId: string; title: string; outcomeCode: string; scheduledFor: string; durationMin: number; objectives: string;
  introduction: string; explanation: string; activity: string; knowledgeCheck: KC[]; worksheet: string; nextActivity: string;
};

const blankQ = (): KC => ({ prompt: "", options: ["", ""], answerIndex: 0, hint: "", explanation: "" });

export function LessonForm({ lessonId, classes, defaults }: { lessonId: string | null; classes: { id: string; name: string }[]; defaults: LessonDefaults }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveLesson.bind(null, lessonId), {});
  const [kc, setKc] = useState<KC[]>(defaults.knowledgeCheck);
  const upd = (i: number, patch: Partial<KC>) => setKc(kc.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const field = (name: keyof LessonDefaults, label: string, rows = 3, help?: string) => (
    <label className="label">{label}{help && <span className="text-xs font-normal text-muted">{help}</span>}
      <textarea className="input" name={name} rows={rows} defaultValue={defaults[name] as string} />
    </label>
  );

  return (
    <form onSubmit={keepValues(action)} className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="card gap-4">
        <label className="label">Title<input className="input" name="title" defaultValue={defaults.title} required /></label>
        {field("objectives", "1. Learning objectives", 3, "One per line, e.g. “I can…”")}
        {field("introduction", "2. Introduction")}
        {field("explanation", "3. Explanation & examples", 6)}
        {field("activity", "4. Interactive activity")}
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-bold">5. Knowledge-check questions <span className="font-normal text-muted">(instant feedback for students)</span></legend>
          {kc.map((q, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <div className="flex gap-2"><input className="input" placeholder={`Question ${i + 1}`} value={q.prompt} onChange={(e) => upd(i, { prompt: e.target.value })} aria-label={`Question ${i + 1} prompt`} /><button type="button" className="btn btn-sm" onClick={() => setKc(kc.filter((_, j) => j !== i))}>Remove</button></div>
              {q.options.map((o, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input type="radio" name={`kc-correct-${i}`} checked={q.answerIndex === oi} onChange={() => upd(i, { answerIndex: oi })} aria-label={`Mark option ${oi + 1} correct`} />
                  <input className="input" placeholder={`Option ${oi + 1}`} value={o} onChange={(e) => upd(i, { options: q.options.map((x, k) => (k === oi ? e.target.value : x)) })} aria-label={`Option ${oi + 1}`} />
                  {q.options.length > 2 && <button type="button" className="btn btn-sm" onClick={() => upd(i, { options: q.options.filter((_, k) => k !== oi), answerIndex: Math.min(q.answerIndex, q.options.length - 2) })} aria-label="Remove option">×</button>}
                </div>
              ))}
              {q.options.length < 6 && <button type="button" className="btn btn-sm self-start" onClick={() => upd(i, { options: [...q.options, ""] })}>Add option</button>}
              <input className="input" placeholder="Hint (shown before answering)" value={q.hint} onChange={(e) => upd(i, { hint: e.target.value })} aria-label="Hint" />
              <input className="input" placeholder="Explanation (shown after answering)" value={q.explanation} onChange={(e) => upd(i, { explanation: e.target.value })} aria-label="Explanation" />
            </div>
          ))}
          <button type="button" className="btn btn-sm self-start" onClick={() => setKc([...kc, blankQ()])}>Add question</button>
          <input type="hidden" name="knowledgeCheck" value={JSON.stringify(kc)} />
        </fieldset>
        {field("worksheet", "6. Practice worksheet", 5, "One item per line")}
        <p className="rounded-lg bg-surface-2 p-3 text-sm"><b>7. Assessment:</b> link an assignment to this lesson from the assignment builder.</p>
        {field("nextActivity", "8. Recommended next activity", 2)}
      </div>

      <div className="flex flex-col gap-4 self-start lg:sticky lg:top-20">
        <div className="card gap-4">
          <label className="label">Class
            <select className="input" name="classId" defaultValue={defaults.classId} required>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="label">Date and time (GST)<input className="input" type="datetime-local" name="scheduledFor" defaultValue={defaults.scheduledFor} required /></label>
          <label className="label">Duration (minutes)<input className="input" type="number" name="durationMin" min={5} max={240} defaultValue={defaults.durationMin} /></label>
          <label className="label">Curriculum outcome code<input className="input" name="outcomeCode" defaultValue={defaults.outcomeCode} placeholder="From your school's curriculum map" /></label>
        </div>
        {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn" name="intent" value="draft" disabled={pending}>Save draft</button>
          <button className="btn-primary" name="intent" value="publish" disabled={pending}>{pending ? "Saving…" : "Save & publish"}</button>
        </div>
      </div>
    </form>
  );
}
