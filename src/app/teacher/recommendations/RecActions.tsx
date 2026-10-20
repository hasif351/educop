"use client";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { keepValues } from "@/components/submit";
import { modifyRecommendation, setRecommendationStatus, type FormState } from "./actions";
import { KIND_LABEL, REC_KINDS } from "./kinds";

type Rec = { id: string; status: string; title: string; kind: string; note: string };

export function RecActions({ rec }: { rec: Rec }) {
  const [pending, start] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, saving] = useActionState<FormState, FormData>(modifyRecommendation.bind(null, rec.id), {});
  useEffect(() => { if (state.ok) dialog.current?.close(); }, [state]);
  if (rec.status === "DONE" || rec.status === "DISMISSED") return null;
  const review = rec.status === "PENDING_REVIEW";

  return (
    <div className="flex flex-wrap gap-2">
      {review
        ? <button className="btn-primary btn-sm" disabled={pending} onClick={() => start(() => setRecommendationStatus(rec.id, "approve"))}>Approve &amp; assign</button>
        : <button className="btn-primary btn-sm" disabled={pending} onClick={() => start(() => setRecommendationStatus(rec.id, "done"))}>Mark done</button>}
      <button className="btn btn-sm" onClick={() => dialog.current?.showModal()}>Modify</button>
      <button className="btn btn-sm text-bad" disabled={pending} onClick={() => start(() => setRecommendationStatus(rec.id, "dismiss"))}>Dismiss</button>

      <dialog ref={dialog} aria-labelledby={`m-${rec.id}`} className="w-[min(32rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-0 text-fg backdrop:bg-black/40">
        <form onSubmit={keepValues(action)} className="flex flex-col gap-4 p-5">
          <h2 id={`m-${rec.id}`} className="text-lg">Modify recommendation</h2>
          <label className="label">What students will see<input className="input" name="title" defaultValue={rec.title} maxLength={160} required /></label>
          <label className="label">Kind
            <select className="input" name="kind" defaultValue={rec.kind}>
              {REC_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <label className="label">Evidence note <span className="text-xs font-normal text-muted">Added to the evidence as your note. The original evidence is kept.</span>
            <textarea className="input" name="note" rows={3} maxLength={500} defaultValue={rec.note} />
          </label>
          {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>}
          <div className="flex flex-wrap gap-2">
            {review && <button className="btn-primary" name="intent" value="approve" disabled={saving}>Save &amp; approve</button>}
            <button className={review ? "btn" : "btn-primary"} name="intent" value="save" disabled={saving}>Save</button>
            <button type="button" className="btn" onClick={() => dialog.current?.close()}>Cancel</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
