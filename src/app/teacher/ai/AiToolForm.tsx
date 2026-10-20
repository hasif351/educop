"use client";
import { useActionState, useState } from "react";
import { keepValues } from "@/components/submit";
import type { AiTool } from "@/lib/ai-teacher";
import { generateDraft, type FormState } from "./actions";

const GRADES = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const gradeName = (g: number) => (g === -1 ? "KG1" : g === 0 ? "KG2" : `Grade ${g}`);

type Props = { tool: AiTool; classes: { id: string; name: string; gradeLevel: number }[]; submissions: { id: string; label: string }[]; preselect?: string };

export function AiToolForm({ tool, classes, submissions, preselect = "" }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(generateDraft, {});
  const [grade, setGrade] = useState(classes[0]?.gradeLevel ?? 5);
  const feedback = tool === "feedback";

  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-4">
      <input type="hidden" name="tool" value={tool} />
      {feedback ? (
        submissions.length === 0 ? <p className="text-sm text-muted">No handed-in work in your classes yet.</p> : (
          <label className="label">Submission
            <select className="input" name="submissionId" required defaultValue={submissions.some((x) => x.id === preselect) ? preselect : ""}>
              <option value="" disabled>Choose a student&apos;s work</option>
              {submissions.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
        )
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="label">Class
              <select className="input" name="classId" defaultValue={classes[0]?.id} onChange={(e) => setGrade(classes.find((c) => c.id === e.target.value)?.gradeLevel ?? grade)}>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="label">Grade
              <select className="input" name="grade" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
                {GRADES.map((g) => <option key={g} value={g}>{gradeName(g)}</option>)}
              </select>
            </label>
          </div>
          <label className="label">Topic<input className="input" name="topic" maxLength={160} required placeholder="e.g. Fractions on a number line" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="label">Outcome code <span className="text-xs font-normal text-muted">From your school&apos;s curriculum map</span><input className="input" name="outcomeCode" maxLength={60} placeholder="e.g. G5-NUM-FR-05" /></label>
            {tool === "quiz" && <label className="label">Number of questions<input className="input" type="number" name="questionCount" min={2} max={10} defaultValue={5} /></label>}
          </div>
        </>
      )}
      <label className="label">{feedback ? "What to focus on" : "Extra notes"} <span className="text-xs font-normal text-muted">Optional</span>
        <textarea className="input" name="notes" rows={3} maxLength={1000} placeholder={feedback ? "e.g. Praise the drawing; the method needs work." : "e.g. Mixed ability, 40 minutes, uses fraction strips"} />
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>}
      <button className="btn-primary self-start" disabled={pending || (feedback && submissions.length === 0)}>{pending ? "Drafting…" : "Generate draft"}</button>
    </form>
  );
}
