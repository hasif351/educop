"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { keepValues } from "@/components/submit";
import { createRecommendation, type FormState } from "./actions";
import { KIND_LABEL, REC_KINDS } from "./kinds";

type Cls = { id: string; name: string; students: { id: string; name: string }[]; lessons: { id: string; title: string }[] };

export function NewRecForm({ classes, preselect }: { classes: Cls[]; preselect: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createRecommendation, {});
  const [picked, setPicked] = useState<Set<string>>(new Set(preselect ? [preselect] : []));
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) { form.current?.reset(); setPicked(new Set()); } }, [state]);
  const toggle = (id: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  const withStudents = classes.filter((c) => c.students.length > 0);

  return (
    <form ref={form} onSubmit={keepValues(action)} className="flex flex-col gap-4">
      {withStudents.map((c) => (
        <fieldset key={c.id} className="flex flex-col gap-1.5 text-sm">
          <legend className="mb-1 flex w-full items-center justify-between gap-2 font-bold">{c.name}
            <button type="button" className="btn btn-sm" onClick={() => setPicked((p) => new Set([...p, ...c.students.map((x) => x.id)]))}>Select whole class</button>
          </legend>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {c.students.map((st) => (
              <label key={st.id} className="flex items-center gap-2">
                <input type="checkbox" name="studentIds" value={st.id} checked={picked.has(st.id)} onChange={(e) => toggle(st.id, e.target.checked)} />{st.name}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="text-xs text-muted" aria-live="polite">{picked.size} selected</p>
      <label className="label">Kind
        <select className="input" name="kind" defaultValue="PRACTICE">
          {REC_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </label>
      <label className="label">What students will see<input className="input" name="title" maxLength={160} placeholder="e.g. Number line warm-up, 10 minutes" required /></label>
      <label className="label">Linked lesson <span className="text-xs font-normal text-muted">Optional</span>
        <select className="input" name="lessonId" defaultValue="">
          <option value="">None</option>
          {classes.map((c) => c.lessons.length > 0 && <optgroup key={c.id} label={c.name}>{c.lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</optgroup>)}
        </select>
      </label>
      <label className="label">Evidence note<textarea className="input" name="note" rows={2} maxLength={500} placeholder="Why you're suggesting this" /></label>
      {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-lg bg-good-soft px-3 py-2 text-sm font-bold text-good">Recommendation saved.</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" name="intent" value="assign" disabled={pending}>Assign now</button>
        <button className="btn" name="intent" value="review" disabled={pending}>Save for review</button>
      </div>
    </form>
  );
}
