"use client";
import { useActionState, useEffect, useRef } from "react";
import { keepValues } from "@/components/submit";
import type { FormState } from "./form-state";

/**
 * A form posted to a server action that returns FormState. Keeps what was typed
 * when the server says no, and clears the form after a success.
 */
export function ActionForm({ action, submit, pendingLabel = "Saving…", className = "flex flex-col gap-3", reset = true, children }: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submit: string; pendingLabel?: string; className?: string; reset?: boolean; children: React.ReactNode;
}) {
  const [state, dispatch, pending] = useActionState<FormState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok && reset) ref.current?.reset(); }, [state, reset]);
  return (
    <form ref={ref} onSubmit={keepValues(dispatch)} className={className}>
      {children}
      {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-lg bg-good-soft px-3 py-2 text-sm font-bold text-good">{state.ok}</p>}
      <button className="btn-primary self-start" disabled={pending}>{pending ? pendingLabel : submit}</button>
    </form>
  );
}
