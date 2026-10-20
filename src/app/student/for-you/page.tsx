import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { forYouData } from "@/lib/data-student-modules";
import { BADGES } from "@/lib/points";
import { recentDays } from "@/lib/streak";
import { Chip, Empty, PageHeader, fmtDate } from "@/components/ui";
import { setRecommendationStatus } from "./actions";

export const metadata = { title: "For you" };

const KIND: Record<string, { label: string; tone: "warn" | "blue" | "good" }> = {
  REVIEW: { label: "Review", tone: "warn" }, PRACTICE: { label: "Practice", tone: "blue" }, CHALLENGE: { label: "Challenge", tone: "good" },
};

const DATA_USED: [string, string, "good" | "warn" | "bad"][] = [
  ["Quiz & assessment results", "Yes", "good"],
  ["Lesson completion", "Yes", "good"],
  ["Teacher review of stretch work", "Yes", "good"],
  ["Growth check-ins and reflections", "No", "bad"],
  ["Reasoning skills practice", "No", "bad"],
  ["Camera, voice or facial data", "Never", "bad"],
];

export default async function ForYouPage() {
  const s = await requireRole("STUDENT");
  const d = await forYouData(s);
  const first = s.name.split(" ")[0];
  const earned = new Set(d.badges.map((b) => b.badge));
  const strip = recentDays(d.streak.days, 14);

  return (
    <>
      <PageHeader eyebrow="For you" title={`Recommended for ${first}`} sub="Every suggestion shows the evidence it used. Stretch work is reviewed by your teacher first." />

      <section className="grid gap-4 sm:grid-cols-3" aria-label="My progress">
        <div className="card items-start"><div className="eyebrow">Points</div><div className="tnum font-display text-3xl font-bold" data-testid="points-total">{d.points}</div><p className="text-xs text-muted">For effort: lessons, practice, check-ins and goals.</p></div>
        <div className="card items-start"><div className="eyebrow">Learning streak</div><div className="tnum font-display text-3xl font-bold">{d.streak.current} day{d.streak.current === 1 ? "" : "s"}</div>
          <p className="text-xs text-muted">{d.streak.activeToday ? "You've learned today. Nice!" : d.streak.current ? "Do a lesson, check-in or practice today to keep it going." : "Start a streak with a lesson, check-in or practice set."}</p></div>
        <div className="card items-start"><div className="eyebrow">Badges</div><div className="tnum font-display text-3xl font-bold">{earned.size} <span className="text-base text-muted">of {Object.keys(BADGES).length}</span></div><p className="text-xs text-muted">Badges reward effort and improvement.</p></div>
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="flex flex-col gap-4 lg:col-span-8" aria-labelledby="recs-h">
          <h2 id="recs-h" className="text-lg">Suggestions</h2>
          {d.recs.length === 0 ? <Empty title="Nothing new right now" body="Suggestions appear here after your work is marked. Why not try a reasoning practice set?" href="/student/skills" cta="Reasoning skills" /> : d.recs.map((r) => (
            <article key={r.id} className="card" aria-label={r.title}>
              <div className="flex flex-wrap items-center justify-between gap-2"><Chip tone={KIND[r.kind]?.tone ?? "blue"}>{KIND[r.kind]?.label ?? r.kind}</Chip><span className="text-xs text-muted">{r.kind === "CHALLENGE" ? "✓ Reviewed by your teacher" : "Auto-suggested (low stakes)"} · {fmtDate(r.createdAt)}</span></div>
              <h3 className="text-lg">{r.title}</h3>
              <details className="rounded-lg bg-surface-2 p-3 text-sm" open>
                <summary className="cursor-pointer font-bold">Why am I seeing this?</summary>
                <ul className="mt-1 list-disc pl-5">{r.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
              </details>
              <div className="flex flex-wrap gap-2">
                {r.lessonId && <Link className="btn-primary btn-sm" href={`/student/lessons/${r.lessonId}`}>Open lesson</Link>}
                <form action={setRecommendationStatus.bind(null, r.id, "DONE")}><button className="btn btn-sm">Mark as done</button></form>
                <form action={setRecommendationStatus.bind(null, r.id, "DISMISSED")}><button className="btn btn-sm">Not now</button></form>
              </div>
            </article>
          ))}
        </section>

        <div className="flex flex-col gap-6 lg:col-span-4">
          <section className="card" aria-labelledby="streak-h">
            <h2 id="streak-h" className="text-lg">Last 14 days</h2>
            <ol className="grid grid-cols-7 gap-1.5">
              {strip.map((x) => (
                <li key={x.key} className={`grid aspect-square place-items-center rounded-md text-xs font-bold ${x.active ? "bg-teal text-white" : "bg-surface-2 text-muted"}`}
                  aria-label={`${fmtDate(x.date)}: ${x.active ? "learned" : "no activity"}`}>
                  {fmtDate(x.date, { day: "numeric" })}
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted">A day counts when you work on a lesson, check in on your growth page or finish a practice set.</p>
          </section>

          <section className="card" aria-labelledby="badges-h">
            <h2 id="badges-h" className="text-lg">Achievements</h2>
            <ul className="grid grid-cols-2 gap-2">
              {Object.entries(BADGES).map(([id, b]) => (
                <li key={id} className={`flex flex-col gap-0.5 rounded-lg border p-2.5 text-sm ${earned.has(id) ? "border-teal bg-teal-soft" : "border-dashed border-line opacity-70"}`}>
                  <b>{earned.has(id) ? "🏅 " : ""}{b.label}</b>
                  <span className="text-xs text-muted">{b.description}</span>
                  <span className="sr-only">{earned.has(id) ? "Earned" : "Not earned yet"}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card" aria-labelledby="events-h">
            <h2 id="events-h" className="text-lg">Recent points</h2>
            {d.events.length === 0 ? <p className="text-sm text-muted">Points show up here as you learn.</p> : (
              <ul className="flex flex-col divide-y divide-line text-sm">
                {d.events.map((e) => <li key={e.id} className="flex gap-2 py-1.5"><b className="tnum w-10 text-good">+{e.points}</b><span className="min-w-0 flex-1">{e.reason}</span><span className="text-xs text-muted">{fmtDate(e.createdAt, { day: "numeric", month: "short" })}</span></li>)}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="data-h">
            <h2 id="data-h" className="text-lg">Data used for suggestions</h2>
            <ul className="flex flex-col divide-y divide-line text-sm">
              {DATA_USED.map(([a, b, t]) => <li key={a} className="flex items-center gap-2 py-1.5"><span className="flex-1">{a}</span><Chip tone={t}>{b}</Chip></li>)}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
