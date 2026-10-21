"use client";
import { useActionState } from "react";
import { keepValues } from "@/components/submit";
import { scheduleLive, type LiveFormState } from "@/app/teacher/live/actions";
import { VideoFields } from "./VideoFields";

export function ScheduleForm({ classes, defaultStart, educopEnabled }: { classes: { id: string; name: string }[]; defaultStart: string; educopEnabled: boolean }) {
  const [state, action, pending] = useActionState<LiveFormState, FormData>(scheduleLive, {});
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-3">
      <label className="label">Class
        <select className="input" name="classId" required defaultValue={classes[0]?.id}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </label>
      <label className="label">Title<input className="input" name="title" required maxLength={120} placeholder="e.g. Equivalent fractions" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">Starts (school time)<input className="input" type="datetime-local" name="startsAt" required defaultValue={defaultStart} /></label>
        <label className="label">Minutes<input className="input" type="number" name="durationMin" min={10} max={180} defaultValue={40} required /></label>
      </div>
      <VideoFields educopEnabled={educopEnabled} />
      {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-lg bg-good-soft px-3 py-2 text-sm font-bold text-good">{state.ok}</p>}
      <button className="btn-primary self-start" disabled={pending}>{pending ? "Scheduling…" : "Schedule class"}</button>
    </form>
  );
}
