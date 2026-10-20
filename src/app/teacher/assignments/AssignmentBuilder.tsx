"use client";
import { keepValues } from "@/components/submit";
import { useActionState, useMemo, useState } from "react";
import { saveAssignment, type FormState } from "../actions";

type Q = { type: "MCQ" | "SHORT"; prompt: string; options: string[]; answerIndex: number; points: number };
export type BuilderDefaults = {
  classId: string; lessonId: string; title: string; instructions: string; dueAt: string;
  latePolicy: "penalty" | "nopenalty" | "none"; latePenaltyPerDay: number; maxLateDays: number; questions: Q[];
};
type ClassOpt = { id: string; name: string; lessons: { id: string; title: string }[] };

const newQ = (type: Q["type"]): Q => ({ type, prompt: "", options: type === "MCQ" ? ["", ""] : [], answerIndex: 0, points: type === "MCQ" ? 1 : 2 });

export function AssignmentBuilder({ assignmentId, classes, defaults }: { assignmentId: string | null; classes: ClassOpt[]; defaults: BuilderDefaults }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAssignment.bind(null, assignmentId), {});
  const [qs, setQs] = useState<Q[]>(defaults.questions);
  const [classId, setClassId] = useState(defaults.classId);
  const [latePolicy, setLatePolicy] = useState(defaults.latePolicy);
  const lessons = useMemo(() => classes.find((c) => c.id === classId)?.lessons ?? [], [classes, classId]);
  const total = qs.reduce((t, q) => t + q.points, 0);
  const upd = (i: number, p: Partial<Q>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...p } : q)));
  const move = (i: number, d: -1 | 1) => { const n = [...qs]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setQs(n); };
  const payload = JSON.stringify(qs.map((q) => (q.type === "MCQ" ? q : { type: q.type, prompt: q.prompt, points: q.points })));

  return (
    <form onSubmit={keepValues(action)} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="card gap-4 self-start">
        <h2 className="text-lg">Settings</h2>
        <label className="label">Title<input className="input" name="title" defaultValue={defaults.title} required /></label>
        <label className="label">Class
          <select className="input" name="classId" value={classId} onChange={(e) => setClassId(e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label className="label">Linked lesson <span className="text-xs font-normal text-muted">Used for “review the lesson” suggestions</span>
          <select className="input" name="lessonId" defaultValue={defaults.lessonId}><option value="">None</option>{lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</select>
        </label>
        <label className="label">Instructions<textarea className="input" name="instructions" rows={3} defaultValue={defaults.instructions} /></label>
        <label className="label">Due (GST)<input className="input" type="datetime-local" name="dueAt" defaultValue={defaults.dueAt} required /></label>
        <label className="label">Late work
          <select className="input" name="latePolicy" value={latePolicy} onChange={(e) => setLatePolicy(e.target.value as BuilderDefaults["latePolicy"])}>
            <option value="penalty">Accept with a penalty</option><option value="nopenalty">Accept, no penalty</option><option value="none">Don&apos;t accept late work</option>
          </select>
        </label>
        {latePolicy !== "none" && (
          <div className="grid grid-cols-2 gap-3">
            {latePolicy === "penalty" && <label className="label">% off per day<input className="input" type="number" name="latePenaltyPerDay" min={1} max={100} defaultValue={defaults.latePenaltyPerDay} /></label>}
            <label className="label">Up to (days)<input className="input" type="number" name="maxLateDays" min={1} max={30} defaultValue={defaults.maxLateDays} /></label>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between"><h2 className="text-lg">Questions</h2><span className="tnum text-sm text-muted">{qs.length} questions · {total} points</span></div>
        {qs.map((q, i) => (
          <div key={i} className="card gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold">Q{i + 1} · {q.type === "MCQ" ? "Multiple choice (auto-marked)" : "Short answer (you mark)"}</span>
              <div className="flex items-center gap-1">
                <label className="flex items-center gap-1 text-xs">Points<input className="input w-16 py-1" type="number" min={1} max={100} value={q.points} onChange={(e) => upd(i, { points: Math.max(1, Number(e.target.value) || 1) })} aria-label={`Points for question ${i + 1}`} /></label>
                <button type="button" className="btn btn-sm" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button type="button" className="btn btn-sm" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                <button type="button" className="btn btn-sm text-bad" onClick={() => setQs(qs.filter((_, j) => j !== i))}>Delete</button>
              </div>
            </div>
            <textarea className="input" rows={2} placeholder="Question" value={q.prompt} onChange={(e) => upd(i, { prompt: e.target.value })} aria-label={`Question ${i + 1}`} />
            {q.type === "MCQ" && (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted">Select the correct answer</span>
                {q.options.map((o, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input type="radio" name={`correct-${i}`} checked={q.answerIndex === oi} onChange={() => upd(i, { answerIndex: oi })} aria-label={`Option ${oi + 1} is correct`} />
                    <input className="input" placeholder={`Option ${oi + 1}`} value={o} onChange={(e) => upd(i, { options: q.options.map((x, k) => (k === oi ? e.target.value : x)) })} aria-label={`Option ${oi + 1}`} />
                    {q.options.length > 2 && <button type="button" className="btn btn-sm" aria-label="Remove option" onClick={() => upd(i, { options: q.options.filter((_, k) => k !== oi), answerIndex: q.answerIndex >= oi && q.answerIndex > 0 ? q.answerIndex - 1 : q.answerIndex })}>×</button>}
                  </div>
                ))}
                {q.options.length < 6 && <button type="button" className="btn btn-sm self-start" onClick={() => upd(i, { options: [...q.options, ""] })}>Add option</button>}
              </div>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => setQs([...qs, newQ("MCQ")])}>+ Multiple choice</button>
          <button type="button" className="btn" onClick={() => setQs([...qs, newQ("SHORT")])}>+ Short answer</button>
        </div>
        <input type="hidden" name="questions" value={payload} />
        {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>}
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <button className="btn" name="intent" value="draft" disabled={pending}>Save draft</button>
          <button className="btn-primary" name="intent" value="publish" disabled={pending}>{pending ? "Saving…" : "Publish to class"}</button>
        </div>
      </div>
    </form>
  );
}
