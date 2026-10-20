"use client";
import { useActionState, useOptimistic, useTransition } from "react";
import { keepValues } from "@/components/submit";
import { changePassword, requestDeletion, savePrefs, saveProfile, setConsent, type FormState } from "@/app/actions-account";
import type { Prefs } from "@/lib/prefs";

/** A real checkbox drawn as a switch (inset-shadow knob), so labels and keyboard work natively. */
export function Switch(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input type="checkbox" role="switch" {...props}
      className="h-[22px] w-10 flex-none cursor-pointer appearance-none rounded-full bg-surface shadow-[inset_-18px_0_0_2px_rgb(var(--line))] transition-shadow checked:shadow-[inset_18px_0_0_2px_rgb(var(--teal))] disabled:cursor-not-allowed disabled:opacity-60" />
  );
}

export function SwitchRow({ name, label, help, defaultChecked, ...rest }: { name?: string; label: string; help?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex items-center gap-3 border-t border-line py-2.5 first:border-0 first:pt-0">
      <span className="min-w-0 flex-1"><b className="block text-sm">{label}</b>{help && <span className="block text-xs text-muted">{help}</span>}</span>
      <Switch name={name} defaultChecked={defaultChecked} {...rest} />
    </label>
  );
}

function Status({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>;
  if (state.ok) return <p role="status" className="rounded-lg bg-good-soft px-3 py-2 text-sm font-bold text-good">{state.ok}</p>;
  return null;
}

export function ProfileForm({ name, email, prefs, languages, timeZones }: {
  name: string; email: string; prefs: Prefs; languages: readonly { value: string; label: string }[]; timeZones: readonly { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfile, {});
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">Display name<input className="input" name="name" defaultValue={name} required maxLength={80} autoComplete="name" /></label>
        <label className="label">Email<input className="input" type="email" value={email} readOnly disabled aria-describedby="email-help" /><span id="email-help" className="text-xs font-normal text-muted">Your school manages sign-in emails.</span></label>
        <label className="label">Language
          <select className="input" name="language" defaultValue={prefs.language}>{languages.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
        </label>
        <label className="label">Time zone
          <select className="input" name="timeZone" defaultValue={prefs.timeZone}>{timeZones.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
        </label>
      </div>
      <Status state={state} />
      <button className="btn-primary self-start" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button>
    </form>
  );
}

export function PrefsForm({ group, rows }: { group: "a11y" | "notify"; rows: { name: string; label: string; help: string; on: boolean }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePrefs.bind(null, group), {});
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-4">
      <div className="flex flex-col">{rows.map((r) => <SwitchRow key={r.name} name={r.name} label={r.label} help={r.help} defaultChecked={r.on} />)}</div>
      <Status state={state} />
      <button className="btn-primary self-start" disabled={pending}>{pending ? "Saving…" : group === "a11y" ? "Save accessibility settings" : "Save notification settings"}</button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, {});
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-3">
      <label className="label">Current password<input className="input" type="password" name="current" autoComplete="current-password" required /></label>
      <label className="label">New password<input className="input" type="password" name="next" autoComplete="new-password" minLength={10} required aria-describedby="pw-help" /><span id="pw-help" className="text-xs font-normal text-muted">At least 10 characters. A short sentence is easy to remember.</span></label>
      <label className="label">Confirm new password<input className="input" type="password" name="confirm" autoComplete="new-password" required /></label>
      <Status state={state} />
      <button className="btn-primary self-start" disabled={pending}>{pending ? "Changing…" : "Change password"}</button>
    </form>
  );
}

export function ConsentSwitch({ studentId, consentKey, label, granted }: { studentId: string; consentKey: string; label: string; granted: boolean }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useOptimistic(granted);
  return (
    <Switch checked={on} disabled={pending} aria-label={label}
      onChange={(e) => { const v = e.target.checked; start(async () => { setOn(v); await setConsent(studentId, consentKey, v); }); }} />
  );
}

export function DeletionForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestDeletion, {});
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-3">
      <label className="label">Anything the school should know? <span className="font-normal text-muted">(optional)</span><textarea className="input" name="reason" rows={2} maxLength={1000} /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm" className="mt-1" /> I understand the school will review this request before anything is deleted.</label>
      <Status state={state} />
      <button className="btn self-start border-bad text-bad" disabled={pending}>{pending ? "Sending…" : "Request account deletion"}</button>
    </form>
  );
}
