"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { keepValues } from "@/components/submit";
import { createSchool, type NewSchoolState } from "../../actions";

export function NewSchoolForm({ orgs }: { orgs: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<NewSchoolState, FormData>(createSchool, {});
  const [org, setOrg] = useState(orgs[0]?.id ?? "");
  if (state.created) {
    return (
      <section role="status" className="card">
        <h2 className="text-lg">{state.created.school} is ready</h2>
        <p className="text-sm">Send these sign-in details to the school admin securely:</p>
        <p className="text-sm">Email: <b>{state.created.email}</b></p>
        <p className="text-sm">Temporary password: <code className="tnum rounded bg-surface-2 px-1.5 py-0.5 font-bold" data-testid="temp-password">{state.created.password}</code></p>
        <p className="rounded-lg bg-warn-soft p-3 text-sm text-warn">Copy it now. It is shown only once. The admin should change it after signing in, then add an academic year, subjects and people.</p>
        <Link className="btn self-start" href="/platform/schools">Back to schools</Link>
      </section>
    );
  }
  return (
    <form onSubmit={keepValues(action)} className="grid gap-6 lg:grid-cols-2">
      <fieldset className="card">
        <legend className="sr-only">Organisation and school</legend>
        <h2 className="text-lg">Organisation</h2>
        <label className="label">Organisation
          <select className="input" name="organizationId" value={org} onChange={(e) => setOrg(e.target.value)}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            <option value="">New organisation…</option>
          </select>
        </label>
        {org === "" && <label className="label">New organisation name<input className="input" name="organizationName" required maxLength={120} /></label>}
        <h2 className="text-lg">School</h2>
        <label className="label">School name<input className="input" name="name" required maxLength={120} /></label>
        <label className="label">Web name<input className="input" name="slug" required maxLength={50} placeholder="harbour-lights" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="label">City<input className="input" name="city" maxLength={80} /></label>
          <label className="label">Curriculum<select className="input" name="curriculum" defaultValue="British">{["British", "American", "IB", "Indian (CBSE)", "UAE Ministry of Education", "French", "Other"].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="label">Plan<select className="input" name="plan" defaultValue="Trial">{["Pilot", "Trial", "Standard", "Enterprise"].map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="label">Student seat limit<input className="input" type="number" name="seatLimit" min={1} max={100000} defaultValue={200} required /></label>
        </div>
      </fieldset>
      <fieldset className="card self-start">
        <legend className="sr-only">First school admin</legend>
        <h2 className="text-lg">First school admin</h2>
        <p className="text-sm text-muted">They manage the school from then on. A temporary password is generated and shown once.</p>
        <label className="label">Admin name<input className="input" name="adminName" required maxLength={120} /></label>
        <label className="label">Admin email<input className="input" type="email" name="adminEmail" required maxLength={200} /></label>
        {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>}
        <button className="btn-primary self-start" disabled={pending}>{pending ? "Creating…" : "Create school"}</button>
      </fieldset>
    </form>
  );
}
