import Link from "next/link";
import { db } from "@/lib/db";
import { CONSENTS, LANGUAGES, TIME_ZONES, readPrefs } from "@/lib/prefs";
import { ROLE_HOME } from "@/lib/roles";
import type { SessionPayload } from "@/lib/session";
import { Chip, PageHeader, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ConsentSwitch, DeletionForm, PasswordForm, PrefsForm, ProfileForm, Switch } from "./SettingsForms";

// Settings & privacy for every role; /<role>/settings pages render it.

const TABS = [
  { key: "profile", label: "Profile" },
  { key: "accessibility", label: "Accessibility" },
  { key: "notifications", label: "Notifications" },
  { key: "privacy", label: "Privacy & consent" },
  { key: "security", label: "Security" },
] as const;

const VISIBILITY = [
  ["Lesson progress & results", "✓", "✓", "✓", "Summary"],
  ["Wellbeing check-ins", "✓", "Only if shared", "–", "–"],
  ["Reasoning skills practice", "✓", "✓", "Summary", "–"],
  ["AI study buddy chats", "✓", "If flagged for safety", "–", "–"],
  ["Live class attendance", "✓", "✓", "✓", "Summary"],
];

export async function SettingsPage({ s, tab }: { s: SessionPayload; tab?: string }) {
  const t = TABS.find((x) => x.key === tab)?.key ?? "profile";
  const home = ROLE_HOME[s.role];
  const user = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { name: true, email: true, prefs: true, role: true } });
  const prefs = readPrefs(user.prefs);
  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("");

  let body: React.ReactNode = null;
  if (t === "profile") body = (
    <section className="card max-w-3xl" aria-labelledby="h-profile">
      <div className="flex items-center gap-3">
        <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-teal-soft font-display font-bold text-teal">{initials}</span>
        <div><h2 id="h-profile" className="text-lg">{user.name}</h2><div className="text-sm text-muted">{user.email}</div></div>
      </div>
      <ProfileForm name={user.name} email={user.email} prefs={prefs} languages={LANGUAGES} timeZones={TIME_ZONES} />
    </section>
  );
  if (t === "accessibility") body = (
    <section className="card max-w-3xl" aria-labelledby="h-a11y">
      <h2 id="h-a11y" className="text-lg">Accessibility</h2>
      <PrefsForm group="a11y" rows={[
        { name: "largerText", label: "Larger text", help: "Increases text size across the app", on: prefs.a11y.largerText },
        { name: "calm", label: "Calm mode (reduce motion)", help: "Turns off animations and transitions", on: prefs.a11y.calm },
        { name: "captions", label: "Captions in live classes", help: "Shown where the video provider supports them", on: prefs.a11y.captions },
        { name: "readAloud", label: "Read-aloud buttons", help: "Text-to-speech on lessons and questions", on: prefs.a11y.readAloud },
      ]} />
      <p className="text-sm text-muted">Theme follows your device setting.</p>
    </section>
  );
  if (t === "notifications") body = (
    <section className="card max-w-3xl" aria-labelledby="h-notif">
      <h2 id="h-notif" className="text-lg">How we reach you</h2>
      <PrefsForm group="notify" rows={[
        { name: "email", label: "Email", help: "Assignments, feedback, reports", on: prefs.notify.email },
        { name: "push", label: "App notifications", help: "Live class reminders, messages", on: prefs.notify.push },
        { name: "sms", label: "SMS", help: "Urgent school alerts only", on: prefs.notify.sms },
        { name: "digest", label: "Weekly digest", help: "A summary every Sunday evening", on: prefs.notify.digest },
      ]} />
      <p className="text-sm text-muted">In-app notifications are always on. Email, SMS and the digest start once the school connects a delivery provider; your choices are saved now.</p>
    </section>
  );
  if (t === "privacy") body = <Privacy s={s} />;
  if (t === "security") body = (
    <section className="card max-w-3xl" aria-labelledby="h-sec">
      <h2 id="h-sec" className="text-lg">Change password</h2>
      <PasswordForm />
    </section>
  );

  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings & privacy" />
      <nav aria-label="Settings sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
        {TABS.map((x) => (
          <Link key={x.key} href={`${home}/settings?tab=${x.key}`} aria-current={x.key === t ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-bold ${x.key === t ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg"}`}>
            {x.label}
          </Link>
        ))}
      </nav>
      {body}
    </>
  );
}

async function Privacy({ s }: { s: SessionPayload }) {
  // Whose consents this page shows: a parent's verified children, or the student themself.
  const children = s.role === "PARENT"
    ? (await db.parentStudent.findMany({
        where: { parentId: s.userId, verified: true, student: { schoolId: s.schoolId ?? undefined } },
        include: { student: { select: { id: true, name: true } } }, orderBy: { student: { name: "asc" } },
      })).map((l) => l.student)
    : s.role === "STUDENT" ? [{ id: s.userId, name: "You" }] : [];
  const ids = children.map((c) => c.id);
  const [consents, history] = ids.length ? await Promise.all([
    db.consent.findMany({ where: { userId: { in: ids } } }),
    db.auditLog.findMany({
      where: { action: "consent.update", target: { in: ids }, schoolId: s.schoolId },
      include: { actor: { select: { name: true, role: true } } }, orderBy: { createdAt: "desc" }, take: 20,
    }),
  ]) : [[], []];
  const granted = (uid: string, key: string) => consents.find((c) => c.userId === uid && c.key === key)?.granted ?? false;
  const label = (key: unknown) => CONSENTS.find((c) => c.key === key)?.label ?? String(key);
  const nameOf = (id: string | null) => children.find((c) => c.id === id)?.name ?? "";

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {(s.role === "STUDENT" || s.role === "PARENT") && (
        <section className="card overflow-x-auto lg:col-span-7" aria-labelledby="h-who">
          <h2 id="h-who" className="text-lg">Who can see {s.role === "PARENT" ? "your child's" : "your"} information</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-2">Information</th><th className="p-2">{s.role === "PARENT" ? "Child" : "You"}</th><th className="p-2">Teachers</th><th className="p-2">Parents</th><th className="p-2">School admin</th></tr></thead>
            <tbody>{VISIBILITY.map((r) => <tr key={r[0]} className="border-b border-line last:border-0">{r.map((c, i) => i === 0 ? <th key={i} scope="row" className="py-2 pr-2 text-left">{c}</th> : <td key={i} className="p-2">{c}</td>)}</tr>)}</tbody>
          </table>
        </section>
      )}

      <section className={`card ${s.role === "STUDENT" || s.role === "PARENT" ? "lg:col-span-5" : "lg:col-span-12 max-w-3xl"}`} aria-labelledby="h-data">
        <h2 id="h-data" className="text-lg">Your data</h2>
        <p className="flex gap-2 rounded-lg bg-surface-2 p-3 text-sm"><Icon name="shield" className="mt-0.5 text-teal" /><span>Your data is never used to train outside AI models. Records are kept per the school&apos;s retention policy, then deleted.</span></p>
        <a className="btn self-start" href="/api/my-data" download><Icon name="download" /> Download my data</a>
        <p className="text-xs text-muted">A JSON file of the records Educop holds about you.</p>
        <details className="rounded-lg border border-line p-3">
          <summary className="cursor-pointer text-sm font-bold">Request account deletion</summary>
          <div className="mt-3"><DeletionForm /></div>
        </details>
      </section>

      {children.map((c) => (
        <section key={c.id} className="card lg:col-span-12" aria-labelledby={`h-consent-${c.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={`h-consent-${c.id}`} className="text-lg">{s.role === "PARENT" ? `Consents for ${c.name}` : "Your consents"}</h2>
            {s.role === "STUDENT" && <Chip tone="blue">Managed by your parent or guardian</Chip>}
          </div>
          <ul className="flex flex-col">
            {CONSENTS.map((k) => {
              const on = granted(c.id, k.key);
              return (
                <li key={k.key} className="flex items-center gap-3 border-t border-line py-3 first:border-0 first:pt-0">
                  <div className="min-w-0 flex-1"><b className="block text-sm">{k.label}</b><p className="text-sm text-muted">{k.body}</p></div>
                  {s.role === "PARENT"
                    ? <ConsentSwitch studentId={c.id} consentKey={k.key} label={`${k.label} for ${c.name}`} granted={on} />
                    : <><Switch checked={on} disabled readOnly aria-label={k.label} /><span className="sr-only">{on ? "Granted" : "Not granted"}</span></>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {children.length > 0 && (
        <section className="card overflow-x-auto lg:col-span-12" aria-labelledby="h-history">
          <h2 id="h-history" className="text-lg">Consent history</h2>
          {history.length === 0 ? <p className="text-sm text-muted">No changes recorded yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-2">Date</th>{s.role === "PARENT" && <th className="p-2">Child</th>}<th className="p-2">Consent</th><th className="p-2">Given by</th><th className="p-2">Status</th></tr></thead>
              <tbody>{history.map((h) => {
                const m = (h.meta ?? {}) as { key?: string; granted?: boolean };
                return (
                  <tr key={h.id} className="border-b border-line last:border-0">
                    <td className="tnum whitespace-nowrap py-2 pr-2">{fmtDate(h.createdAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    {s.role === "PARENT" && <td className="p-2">{nameOf(h.target)}</td>}
                    <td className="p-2">{label(m.key)}</td>
                    <td className="p-2">{h.actor ? `${h.actor.name}${h.actor.role === "PARENT" ? " (parent)" : ""}` : "School"}</td>
                    <td className="p-2"><Chip tone={m.granted ? "good" : "plain"}>{m.granted ? "Granted" : "Declined"}</Chip></td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
