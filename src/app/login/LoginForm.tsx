"use client";
import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions-auth";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="label">School email
        <input className="input" name="email" type="email" autoComplete="username" required />
      </label>
      <label className="label">Password
        <input className="input" name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>}
      <button className="btn-primary py-2.5" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
