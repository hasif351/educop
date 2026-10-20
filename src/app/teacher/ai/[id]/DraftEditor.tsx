"use client";
import { useActionState, useState } from "react";
import { keepValues } from "@/components/submit";
import type { AiTool, DraftContent } from "@/lib/ai-teacher";
import { updateDraft, type FormState } from "../actions";

type Content = DraftContent[AiTool];
const ACCEPT: Record<AiTool, string> = {
  lesson: "Create lesson draft",
  quiz: "Create assignment draft",
  feedback: "Use in marking",
  differentiate: "Mark as used",
  parent_note: "Mark as used",
};

export function DraftEditor({ id, tool, content, locked }: { id: string; tool: AiTool; content: Content; locked: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateDraft.bind(null, id), {});
  const [c, setC] = useState<Content>(content);
  const [copied, setCopied] = useState(false);
  const set = (patch: Record<string, unknown>) => setC({ ...c, ...patch } as Content);

  async function copy() {
    await navigator.clipboard.writeText(plainText(tool, c));
    setCopied(true);
  }

  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-4">
      <fieldset disabled={locked} className="card gap-4">
        <legend className="sr-only">Edit the draft</legend>
        {tool === "lesson" && <LessonFields c={c as DraftContent["lesson"]} set={set} />}
        {tool === "quiz" && <QuizFields c={c as DraftContent["quiz"]} set={set} />}
        {tool === "feedback" && <>
          <Area label="Feedback for the student" value={(c as DraftContent["feedback"]).feedback} onChange={(v) => set({ feedback: v })} rows={6} max={1500} />
          <Area label="Next step" value={(c as DraftContent["feedback"]).nextStep} onChange={(v) => set({ nextStep: v })} rows={2} max={500} />
        </>}
        {tool === "differentiate" && <>
          <Text label="Title" value={(c as DraftContent["differentiate"]).title} onChange={(v) => set({ title: v })} />
          <Area label="Support version" value={(c as DraftContent["differentiate"]).support} onChange={(v) => set({ support: v })} rows={4} max={3000} />
          <Area label="Core version" value={(c as DraftContent["differentiate"]).core} onChange={(v) => set({ core: v })} rows={4} max={3000} />
          <Area label="Stretch version" value={(c as DraftContent["differentiate"]).stretch} onChange={(v) => set({ stretch: v })} rows={4} max={3000} />
        </>}
        {tool === "parent_note" && <>
          <Text label="Subject" value={(c as DraftContent["parent_note"]).subject} onChange={(v) => set({ subject: v })} />
          <Area label="Message" value={(c as DraftContent["parent_note"]).body} onChange={(v) => set({ body: v })} rows={10} max={3000} />
        </>}
        <input type="hidden" name="content" value={JSON.stringify(c)} />
      </fieldset>

      {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>}
      {state.message && <p role="status" className="rounded-lg bg-good-soft px-3 py-2 text-sm font-bold text-good">{state.message}</p>}
      <div className="flex flex-wrap gap-2">
        {!locked && <>
          <button className="btn-primary" name="intent" value="accept" disabled={pending}>{ACCEPT[tool]}</button>
          <button className="btn" name="intent" value="save" disabled={pending}>Save edits</button>
        </>}
        {(tool === "feedback" || tool === "differentiate" || tool === "parent_note") && <button type="button" className="btn" onClick={copy}>{copied ? "Copied" : "Copy text"}</button>}
        {!locked && <button className="btn text-bad" name="intent" value="discard" disabled={pending} formNoValidate>Discard</button>}
      </div>
    </form>
  );
}

function plainText(tool: AiTool, c: Content) {
  if (tool === "feedback") { const f = c as DraftContent["feedback"]; return [f.feedback, f.nextStep && `Next step: ${f.nextStep}`].filter(Boolean).join("\n\n"); }
  if (tool === "parent_note") { const p = c as DraftContent["parent_note"]; return `${p.subject}\n\n${p.body}`; }
  const d = c as DraftContent["differentiate"];
  return `${d.title}\n\nSupport: ${d.support}\n\nCore: ${d.core}\n\nStretch: ${d.stretch}`;
}

function Text({ label, value, onChange, max = 160 }: { label: string; value: string; onChange: (v: string) => void; max?: number }) {
  return <label className="label">{label}<input className="input" value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} /></label>;
}
function Area({ label, value, onChange, rows = 3, max = 5000, help }: { label: string; value: string; onChange: (v: string) => void; rows?: number; max?: number; help?: string }) {
  return (
    <label className="label">{label}{help && <span className="text-xs font-normal text-muted">{help}</span>}
      <textarea className="input" rows={rows} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function LessonFields({ c, set }: { c: DraftContent["lesson"]; set: (p: Partial<DraftContent["lesson"]>) => void }) {
  const kc = c.knowledgeCheck;
  const upd = (i: number, p: Partial<DraftContent["lesson"]["knowledgeCheck"][number]>) => set({ knowledgeCheck: kc.map((q, j) => (j === i ? { ...q, ...p } : q)) });
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <Text label="Lesson title" value={c.title} onChange={(v) => set({ title: v })} />
        <label className="label">Minutes<input className="input" type="number" min={5} max={240} value={c.durationMin} onChange={(e) => set({ durationMin: Number(e.target.value) || 30 })} /></label>
      </div>
      <Area label="1. Learning objectives" help="One per line" value={c.objectives.join("\n")} onChange={(v) => set({ objectives: v.split("\n") })} />
      <Area label="2. Introduction" value={c.introduction} onChange={(v) => set({ introduction: v })} />
      <Area label="3. Explanation & examples" value={c.explanation} onChange={(v) => set({ explanation: v })} rows={5} max={10000} />
      <Area label="4. Interactive activity" value={c.activity} onChange={(v) => set({ activity: v })} />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-bold">5. Knowledge-check questions</legend>
        {kc.map((q, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <div className="flex gap-2"><input className="input" aria-label={`Check question ${i + 1}`} value={q.prompt} onChange={(e) => upd(i, { prompt: e.target.value })} /><button type="button" className="btn btn-sm" onClick={() => set({ knowledgeCheck: kc.filter((_, j) => j !== i) })}>Remove</button></div>
            <Options name={`kc-${i}`} options={q.options} answerIndex={q.answerIndex} onChange={(options, answerIndex) => upd(i, { options, answerIndex })} />
          </div>
        ))}
        {kc.length < 5 && <button type="button" className="btn btn-sm self-start" onClick={() => set({ knowledgeCheck: [...kc, { prompt: "", options: ["", ""], answerIndex: 0, hint: "", explanation: "" }] })}>Add question</button>}
      </fieldset>
      <Area label="6. Practice worksheet" help="One item per line" value={c.worksheet} onChange={(v) => set({ worksheet: v })} rows={5} />
      <Area label="7. Assessment idea" help="Kept with this draft; link a real assignment from the assignment builder" value={c.assessment} onChange={(v) => set({ assessment: v })} rows={2} max={2000} />
      <Area label="8. Recommended next activity" value={c.nextActivity} onChange={(v) => set({ nextActivity: v })} rows={2} max={2000} />
    </>
  );
}

function QuizFields({ c, set }: { c: DraftContent["quiz"]; set: (p: Partial<DraftContent["quiz"]>) => void }) {
  const qs = c.questions;
  const upd = (i: number, p: Record<string, unknown>) => set({ questions: qs.map((q, j) => (j === i ? ({ ...q, ...p } as typeof q) : q)) });
  return (
    <>
      <Text label="Assignment title" value={c.title} onChange={(v) => set({ title: v })} />
      <Area label="Instructions" value={c.instructions} onChange={(v) => set({ instructions: v })} rows={2} />
      <ol className="flex flex-col gap-3">
        {qs.map((q, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <b>Q{i + 1} · {q.type === "MCQ" ? "Multiple choice" : "Short answer"}</b>
              <span className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs">Points<input className="input w-16" type="number" min={1} max={100} value={q.points} onChange={(e) => upd(i, { points: Number(e.target.value) || 1 })} /></label>
                <button type="button" className="btn btn-sm" onClick={() => set({ questions: qs.filter((_, j) => j !== i) })} disabled={qs.length === 1}>Remove</button>
              </span>
            </div>
            <input className="input" aria-label={`Question ${i + 1} prompt`} value={q.prompt} onChange={(e) => upd(i, { prompt: e.target.value })} />
            {q.type === "MCQ"
              ? <Options name={`q-${i}`} options={q.options} answerIndex={q.answerIndex} onChange={(options, answerIndex) => upd(i, { options, answerIndex })} />
              : <input className="input" aria-label={`Question ${i + 1} model answer`} placeholder="Model answer (for your marking, not shown to students)" value={q.modelAnswer} onChange={(e) => upd(i, { modelAnswer: e.target.value })} />}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm" onClick={() => set({ questions: [...qs, { type: "MCQ", prompt: "", options: ["", ""], answerIndex: 0, points: 1 }] })}>Add multiple choice</button>
        <button type="button" className="btn btn-sm" onClick={() => set({ questions: [...qs, { type: "SHORT", prompt: "", points: 2, modelAnswer: "" }] })}>Add short answer</button>
      </div>
    </>
  );
}

function Options({ name, options, answerIndex, onChange }: { name: string; options: string[]; answerIndex: number; onChange: (o: string[], a: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((o, oi) => (
        <div key={oi} className="flex items-center gap-2">
          <input type="radio" name={name} checked={answerIndex === oi} onChange={() => onChange(options, oi)} aria-label={`Option ${oi + 1} is correct`} />
          <input className="input" aria-label={`Option ${oi + 1}`} value={o} onChange={(e) => onChange(options.map((x, k) => (k === oi ? e.target.value : x)), answerIndex)} />
          {options.length > 2 && <button type="button" className="btn btn-sm" aria-label={`Remove option ${oi + 1}`} onClick={() => onChange(options.filter((_, k) => k !== oi), Math.min(answerIndex, options.length - 2))}>×</button>}
        </div>
      ))}
      {options.length < 6 && <button type="button" className="btn btn-sm self-start" onClick={() => onChange([...options, ""], answerIndex)}>Add option</button>}
    </div>
  );
}
