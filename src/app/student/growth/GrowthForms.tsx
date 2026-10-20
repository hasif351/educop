"use client";
import { useActionState, useRef, useState, useTransition } from "react";
import { keepValues } from "@/components/submit";
import { FEELINGS, MOODS, type Scenario } from "@/lib/sel";
import { addGoal, requestCheckin, saveCheckin, saveReflection, setHabit, type GrowthState } from "./actions";

const Alert = ({ state }: { state: GrowthState }) =>
  state.error ? <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p> : null;

function ShareSwitch({ id }: { id: string }) {
  return (
    <label htmlFor={id} className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm">
      <input id={id} type="checkbox" name="shared" className="mt-1" />
      <span><b>Share with my teacher</b><br /><span className="text-muted">Off unless you tick it. If you share, your teacher can read this one entry.</span></span>
    </label>
  );
}

export function CheckinForm({ teacherNote }: { teacherNote: boolean }) {
  const [state, action, pending] = useActionState<GrowthState, FormData>(saveCheckin, {});
  const [asked, setAsked] = useState(false);
  const [askPending, startAsk] = useTransition();
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold">How do you feel about learning today?</legend>
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <label key={m.value} className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-bold has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2">
              <input type="radio" name="mood" value={m.value} className="sr-only" />
              <span className="text-2xl" aria-hidden="true">{m.emoji}</span>{m.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold">Pick any words that fit (optional)</legend>
        <div className="flex flex-wrap gap-2">
          {FEELINGS.map((f) => (
            <label key={f} className="cursor-pointer rounded-full border border-line px-3 py-1 text-sm font-bold has-[:checked]:border-teal has-[:checked]:bg-teal-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2">
              <input type="checkbox" name="feelings" value={f} className="sr-only" />{f}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="label">Anything you want to add? (optional)
        <textarea name="note" className="input min-h-20 font-normal" maxLength={500} />
      </label>
      <ShareSwitch id="checkin-share" />
      <Alert state={state} />
      {state.ok && (
        <div role="status" className="flex flex-col gap-2 rounded-lg bg-teal-soft px-3 py-2 text-sm">
          <b>Check-in saved. Thanks for taking a moment.</b>
          {state.care && (
            <>
              <span>Thanks for sharing. Would a 3-minute stretch break help? You can also ask your teacher for a quick, private check-in.</span>
              {teacherNote && (asked
                ? <span className="font-bold">Your teacher has been asked. They&apos;ll find a moment to talk.</span>
                : <button type="button" className="btn btn-sm self-start" disabled={askPending} onClick={() => startAsk(async () => { await requestCheckin(); setAsked(true); })}>Ask for a check-in</button>)}
            </>
          )}
        </div>
      )}
      <button className="btn-primary self-start" disabled={pending}>{pending ? "Saving…" : "Save check-in"}</button>
    </form>
  );
}

export function ReflectionForm({ scenarios }: { scenarios: Scenario[] }) {
  const [state, action, pending] = useActionState<GrowthState, FormData>(saveReflection, {});
  const [id, setId] = useState(scenarios[0].id);
  const sc = scenarios.find((x) => x.id === id)!;
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-4">
      <label className="label">Choose a scenario
        <select name="scenario" className="input font-normal" value={id} onChange={(e) => setId(e.target.value)}>
          {scenarios.map((x) => <option key={x.id} value={x.id}>{x.title} ({x.tag})</option>)}
        </select>
      </label>
      <p>{sc.text}</p>
      <fieldset className="flex flex-col gap-2" key={sc.id}>
        <legend className="mb-2 text-sm font-bold">Which idea is closest to yours? (optional)</legend>
        {sc.options.map((o, i) => (
          <label key={i} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
            <input type="radio" name="option" value={i} /> {o.text}
          </label>
        ))}
      </fieldset>
      <label className="label">What would you do? Write it in your own words.
        <textarea name="response" className="input min-h-24 font-normal" maxLength={1000} />
      </label>
      <ShareSwitch id="reflect-share" />
      <Alert state={state} />
      {state.ok && <p role="status" className="rounded-lg bg-teal-soft px-3 py-2 text-sm"><b>Saved.</b> {state.thought}</p>}
      <p className="text-xs text-muted">There is no score here.</p>
      <button className="btn-primary self-start" disabled={pending}>{pending ? "Saving…" : "Save my reflection"}</button>
    </form>
  );
}

export function GoalForm() {
  const [state, action, pending] = useActionState<GrowthState, FormData>(async (p: GrowthState, f: FormData) => {
    const r = await addGoal(p, f);
    if (r.ok) formRef.current?.reset();
    return r;
  }, {});
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} onSubmit={keepValues(action)} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <label htmlFor="goal-text" className="sr-only">New goal</label>
        <input id="goal-text" name="text" className="input" maxLength={120} placeholder="Add a goal, e.g. ask one question in class" />
        <button className="btn-primary" disabled={pending}>Add</button>
      </div>
      <Alert state={state} />
    </form>
  );
}

export function Habits({ items, initial }: { items: { key: string; label: string }[]; initial: Record<string, boolean> }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState(false);
  const [, start] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      {items.map((h) => (
        <label key={h.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-sm hover:bg-surface-2">
          <input type="checkbox" checked={on[h.key] ?? false} onChange={(e) => {
            const v = e.target.checked;
            setOn({ ...on, [h.key]: v });
            start(async () => { try { await setHabit(h.key, v); setError(false); } catch { setError(true); setOn((o) => ({ ...o, [h.key]: !v })); } });
          }} />
          {h.label}
        </label>
      ))}
      {error && <p role="alert" className="text-xs font-bold text-bad">Couldn&apos;t save that. Try again.</p>}
    </div>
  );
}

const WHO: [string, string][] = [
  ["You", "Everything you write here"],
  ["Your teacher", "Only the check-ins and reflections you choose to share, plus a class summary with no names (only for groups of 5 or more), and check-in requests you send"],
  ["Your parents", "Not shown on their pages"],
  ["Other students", "Never"],
  ["Nova (study buddy)", "Never. Nova can't see your growth answers"],
];

export function WhoCanSee() {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn" onClick={() => ref.current?.showModal()}>Who can see this?</button>
      <dialog ref={ref} aria-labelledby="who-h" className="w-[min(32rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-0 text-fg backdrop:bg-black/40">
        <div className="flex flex-col gap-3 p-5">
          <h2 id="who-h" className="text-lg">Who can see my growth answers?</h2>
          <dl className="flex flex-col divide-y divide-line text-sm">
            {WHO.map(([a, b]) => <div key={a} className="flex gap-3 py-2"><dt className="w-32 shrink-0 font-bold">{a}</dt><dd>{b}</dd></div>)}
          </dl>
          <p className="text-sm text-muted">Answers are kept for this school year, then deleted unless your school&apos;s policy says otherwise. Nothing here is used to diagnose or discipline anyone.</p>
          <form method="dialog"><button className="btn-primary">Got it</button></form>
        </div>
      </dialog>
    </>
  );
}
