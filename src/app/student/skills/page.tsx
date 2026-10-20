import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { skillsOverview } from "@/lib/data-student-modules";
import { Chip, PageHeader, fmtDate } from "@/components/ui";

export const metadata = { title: "Reasoning skills" };

export default async function SkillsPage() {
  const s = await requireRole("STUDENT");
  const d = await skillsOverview(s);

  return (
    <>
      <PageHeader eyebrow="Reasoning skills practice" title="Thinking skills activities"
        sub="Short puzzle sets about patterns, memory, words, shapes and speed. Puzzles get a little harder or easier as you go, so they stay just right." />

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="card lg:col-span-7" aria-labelledby="start-h">
          <h2 id="start-h" className="text-lg">Before you start</h2>
          <p className="text-sm">Pick a set. Each one has 6–8 puzzles, one at a time. You can take a break at any point, and there&apos;s no pass or fail.</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {d.byDomain.map((x) => (
              <li key={x.domain} className="flex flex-col gap-2 rounded-lg border border-line p-3">
                <div className="flex items-center justify-between gap-2"><b>{x.info.label}</b>{x.count > 0 && <Chip tone="blue">Level {x.level}</Chip>}</div>
                <p className="text-xs text-muted">{x.info.blurb}</p>
                <Link className="btn-primary btn-sm self-start" href={`/student/skills/${x.domain}`} aria-label={`Start ${x.info.label} practice`}>
                  {x.count ? "Practise again" : "Start"}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="card bg-warn-soft lg:col-span-5" aria-labelledby="what-h">
          <h2 id="what-h" className="text-lg">What this is, and what it is not</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
            <li>This is <b>reasoning skills practice</b> to help plan what to practise next. It is <b>not an IQ test</b> and gives no IQ score.</li>
            <li>It is not a psychometric or clinical test.</li>
            <li>Results are never used on their own to label, place or limit anyone.</li>
            <li>You only ever see your own progress, compared with your own earlier practice.</li>
          </ul>
        </section>

        <section className="card lg:col-span-12" id="growth" aria-labelledby="growth-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="growth-h" className="text-lg">Your growth over time</h2>
            <span className="text-xs text-muted">{d.completed} set{d.completed === 1 ? "" : "s"} finished</span>
          </div>
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {d.byDomain.map((x) => (
              <li key={x.domain} className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3 text-sm">
                <div className="flex items-center justify-between"><b>{x.info.label}</b>{x.growth.tone === "up" && <Chip tone="good">Growing</Chip>}</div>
                <p>{x.growth.text}</p>
                {x.history.length > 0 && (
                  <div className="flex h-16 items-end gap-1" role="img" aria-label={`Puzzles solved in your last ${x.history.length} ${x.info.label} sets: ${x.history.map((h) => `${h.pct}%`).join(", ")}`}>
                    {x.history.map((h) => (
                      <span key={h.id} className="flex-1 rounded-t bg-teal" style={{ height: `${Math.max(6, h.pct)}%` }} title={`${fmtDate(h.at)}: ${h.pct}% solved, level ${h.level}`} />
                    ))}
                  </div>
                )}
                {x.lastAt && <span className="text-xs text-muted">Last practised {fmtDate(x.lastAt)}</span>}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Bars show the share of puzzles you solved in each set. Small sets vary a lot from day to day, and that&apos;s normal.</p>
        </section>

        <section className="card lg:col-span-12" aria-labelledby="three-h">
          <h2 id="three-h" className="text-lg">Three different things, kept separate</h2>
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div className="flex flex-col gap-1.5"><div><Chip tone="blue">Educational performance</Chip></div><p>How you did on lessons, quizzes and assignments in the curriculum. Comes from classwork.</p></div>
            <div className="flex flex-col gap-1.5"><div><Chip tone="teal">Reasoning skills practice</Chip></div><p>This page. A practice-focused look at how your reasoning skills grow over time. Used to suggest practice.</p></div>
            <div className="flex flex-col gap-1.5"><div><Chip>Standardized IQ score</Chip></div><p><b>Not provided.</b> Only a validated, licensed instrument given by a qualified professional can produce one.</p></div>
          </div>
        </section>
      </div>
    </>
  );
}
