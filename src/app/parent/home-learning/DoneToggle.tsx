"use client";
import { useOptimistic, useTransition } from "react";
import { toggleHomeActivity } from "../actions";

export function DoneToggle({ childId, activityKey, done, title }: { childId: string; activityKey: string; done: boolean; title: string }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useOptimistic(done);
  return (
    <button type="button" aria-pressed={on} disabled={pending} aria-label={`We did this: ${title}`}
      className={on ? "btn btn-sm self-start border-good bg-good-soft text-good" : "btn btn-sm self-start"}
      onClick={() => start(async () => { setOn(!on); await toggleHomeActivity(childId, activityKey, !on); })}>
      {on ? "✓ We did this" : "We did this"}
    </button>
  );
}
