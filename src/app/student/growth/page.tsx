import { requireRole } from "@/lib/auth";
import { growthData } from "@/lib/data-student-modules";
import { HABITS, MOODS, SCENARIOS } from "@/lib/sel";
import { Chip, Empty, PageHeader, fmtDate } from "@/components/ui";
import { CheckinForm, GoalForm, Habits, ReflectionForm, WhoCanSee } from "./GrowthForms";
import { completeGoal, removeGoal } from "./actions";

export const metadata = { title: "My growth" };

export default async function GrowthPage() {
  const s = await requireRole("STUDENT");
  const d = await growthData(s);
  const open = d.goals.filter((g) => !g.doneAt);
  const done = d.goals.filter((g) => g.doneAt);
  const recent = d.checkins.slice(0, 14).reverse();

  return (
    <>
      <PageHeader eyebrow="My growth" title="Learning habits & teamwork"
        sub="Short reflections that help you and your teacher plan support. Everything here is optional, and private unless you choose to share."
        actions={<WhoCanSee />} />

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="card lg:col-span-7" aria-labelledby="checkin-h">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="checkin-h" className="text-lg">Check-in</h2><Chip tone="teal">Optional</Chip></div>
          <p className="text-sm text-muted">Only you choose this. Nothing is guessed from your camera or voice.</p>
          {d.today && <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm">You checked in today ({MOODS.find((m) => m.value === d.today!.mood)?.label.toLowerCase()}). You can add another if your feelings change.</p>}
          <CheckinForm teacherNote />
        </section>

        <section className="card lg:col-span-5" aria-labelledby="goals-h">
          <h2 id="goals-h" className="text-lg">My goals</h2>
          {open.length === 0 ? <p className="text-sm text-muted">No goals yet. Small ones work best, like &ldquo;read 10 pages every evening&rdquo;.</p> : (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {open.map((g) => (
                <li key={g.id} className="flex items-center gap-2 py-2">
                  <span className="min-w-0 flex-1">{g.text}</span>
                  <form action={completeGoal.bind(null, g.id)}><button className="btn btn-sm" aria-label={`Mark done: ${g.text}`}>Done</button></form>
                  <form action={removeGoal.bind(null, g.id)}><button className="btn btn-sm" aria-label={`Remove goal: ${g.text}`}>✕</button></form>
                </li>
              ))}
            </ul>
          )}
          <GoalForm />
          {done.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-bold">Goals I&apos;ve reached ({done.length})</summary>
              <ul className="mt-2 flex flex-col gap-1">{done.map((g) => <li key={g.id} className="flex gap-2"><span aria-hidden="true">✓</span><span className="flex-1">{g.text}</span><span className="text-xs text-muted">{fmtDate(g.doneAt!)}</span></li>)}</ul>
            </details>
          )}
        </section>

        <section className="card lg:col-span-7" aria-labelledby="scenario-h">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="scenario-h" className="text-lg">Scenario: what would you do?</h2><Chip tone="blue">Reflection</Chip></div>
          <ReflectionForm scenarios={SCENARIOS} />
          {d.reflections.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-bold">My recent reflections</summary>
              <ul className="mt-2 flex flex-col gap-2">
                {d.reflections.map((r) => (
                  <li key={r.id} className="rounded-lg bg-surface-2 p-2">
                    <div className="text-xs text-muted">{SCENARIOS.find((x) => x.id === r.scenario)?.title} · {fmtDate(r.createdAt)}{r.shared ? " · shared with teacher" : ""}{r.sharedWithParent ? " · shared with parent" : ""}</div>
                    {r.response}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="card lg:col-span-5" aria-labelledby="habits-h">
          <h2 id="habits-h" className="text-lg">Study habits</h2>
          <Habits items={HABITS} initial={d.habits} />
          <h3 className="mt-2 font-bold">My check-ins</h3>
          {recent.length === 0 ? <Empty title="No check-ins yet" body="Your own answers will show here as a simple chart." /> : (
            <>
              <div className="flex h-24 items-end gap-1" role="img" aria-label={`Your last ${recent.length} check-ins, from 1 to 5: ${recent.map((c) => c.mood).join(", ")}`}>
                {recent.map((c) => <span key={c.id} className="flex-1 rounded-t bg-teal" style={{ height: `${c.mood * 20}%` }} title={`${fmtDate(c.createdAt)}: ${c.mood}/5`} />)}
              </div>
              <p className="text-xs text-muted">From your own answers (1–5). Only you see this chart.</p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
