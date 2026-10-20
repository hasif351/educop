"use client";
import { useActionState, useState } from "react";
import { keepValues } from "@/components/submit";
import { createUser, type NewUserState } from "../actions";

export function AddUserForm({ seatsLeft }: { seatsLeft: number }) {
  const [state, action, pending] = useActionState<NewUserState, FormData>(createUser, {});
  const [role, setRole] = useState("STUDENT");
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">Full name<input className="input" name="name" required maxLength={120} autoComplete="off" /></label>
        <label className="label">Email<input className="input" name="email" type="email" required maxLength={200} autoComplete="off" /></label>
        <label className="label">Role
          <select className="input" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="STUDENT">Student</option><option value="TEACHER">Teacher</option><option value="PARENT">Parent</option><option value="SCHOOL_ADMIN">School admin</option>
          </select>
        </label>
        {role === "STUDENT" && (
          <label className="label">Grade
            <select className="input" name="grade" defaultValue="">
              <option value="" disabled>Choose…</option>
              <option value="KG1">KG1</option><option value="KG2">KG2</option>
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1)}>Grade {i + 1}</option>)}
            </select>
          </label>
        )}
      </div>
      {role === "STUDENT" && <p className="text-xs text-muted">{seatsLeft} student seat{seatsLeft === 1 ? "" : "s"} left on your plan.</p>}
      {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>}
      {state.created && (
        <div role="status" className="flex flex-col gap-1 rounded-lg bg-good-soft p-3 text-sm text-good">
          <b>{state.created.name} can now sign in.</b>
          <span className="text-fg">Email: <b>{state.created.email}</b></span>
          <span className="text-fg">Temporary password: <code className="tnum rounded bg-surface px-1.5 py-0.5 font-bold" data-testid="temp-password">{state.created.password}</code></span>
          <span className="text-xs text-muted">Copy it now and share it securely. It is shown only once and isn&apos;t stored in readable form.</span>
        </div>
      )}
      <button className="btn-primary self-start" disabled={pending}>{pending ? "Adding…" : "Add user"}</button>
    </form>
  );
}
