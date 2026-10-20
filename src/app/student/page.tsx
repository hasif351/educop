import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { studentDashboard } from "@/lib/data";
import { progressSummary } from "@/lib/data-student-modules";
import { BADGES } from "@/lib/points";
import { percent } from "@/lib/grading";
import { Bar, Chip, Empty, fmtDate, fmtTime, scoreTone } from "@/components/ui";

export const metadata = { title: "Dashboard" };

const KIND_LABEL: Record<string, string> = { REVIEW: "Review", PRACTICE: "Practice", CHALLENGE: "Challenge" };

export default async function StudentDashboard() {
  const s = await requireRole("STUDENT");
  const [d, p] = await Promise.all([studentDashboard(s), progressSummary(s)]);
  const first = s.name.split(" ")[0];
  const now = new Date();
  const lessonsLeft = d.todayLessons.filter((l) => !l.progress[0]?.completedAt).length;

  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-brand-soft to-teal-soft p-6">
        <div>
          <div className="eyebrow">{fmtDate(now, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
          <h1 className="text-3xl">Good to see you, {first}</h1>
          <p className="text-muted">
            {lessonsLeft ? `${lessonsLeft} lesson${lessonsLeft > 1 ? "s" : ""} left today` : "All of today's lessons are done"} · {d.pending.length} assignment{d.pending.length === 1 ? "" : "s"} to do
          </p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="My progress">
          <span className="chip bg-surface px-3 py-1.5 text-sm text-warn">🔥 {p.streak}-day streak</span>
          <span className="chip bg-surface px-3 py-1.5 text-sm text-brand">⭐ {p.points} pts</span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between"><h2 className="text-lg">Today&apos;s lessons</h2><Link className="btn btn-sm" href="/student/lessons">All lessons</Link></div>
          {d.todayLessons.length === 0 ? <Empty title="No lessons today" body="Check your assignments or revise an earlier lesson." /> : (
            <ul className="flex flex-col divide-y divide-line">
              {d.todayLessons.map((l) => {
                const p = l.progress[0];
                const pct = Math.round(((p?.completedSteps.length ?? 0) / 8) * 100);
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="tnum w-12 text-sm text-muted">{fmtTime(l.scheduledFor)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">{l.title}</div>
                      <div className="text-xs text-muted">{l.class.subject.name} · {l.durationMin} min</div>
                    </div>
                    <div className="flex w-28 items-center gap-2"><Bar value={pct} tone="teal" /><span className="tnum text-xs">{pct}%</span></div>
                    <Link className={p?.completedAt ? "btn btn-sm" : "btn-primary btn-sm"} href={`/student/lessons/${l.id}`}>
                      {p?.completedAt ? "Review" : pct ? "Continue" : "Start"}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="text-lg">Recommended for you</h2>
          {d.recs.length === 0 ? <Empty title="Nothing new" body="Suggestions appear here after your work is marked." /> : (
            <ul className="flex flex-col gap-3">
              {d.recs.map((r) => (
                <li key={r.id} className="flex flex-col gap-1.5 rounded-lg bg-surface-2 p-3 text-sm">
                  <div><Chip tone={r.kind === "REVIEW" ? "warn" : r.kind === "CHALLENGE" ? "good" : "blue"}>{KIND_LABEL[r.kind]}</Chip></div>
                  <b>{r.title}</b>
                  <details className="text-xs text-muted"><summary className="cursor-pointer">Why am I seeing this?</summary><ul className="mt-1 list-disc pl-4">{r.evidence.map((e) => <li key={e}>{e}</li>)}</ul></details>
                  {r.lessonId && <Link className="btn btn-sm self-start" href={`/student/lessons/${r.lessonId}`}>Open lesson</Link>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="flex items-center justify-between"><h2 className="text-lg">To do</h2><Link className="btn btn-sm" href="/student/assignments">All</Link></div>
          {d.pending.length === 0 ? <Empty title="All caught up" body="No assignments waiting." /> : (
            <ul className="flex flex-col divide-y divide-line">
              {d.pending.map((a) => {
                const overdue = a.dueAt < now;
                const soon = !overdue && a.dueAt.getTime() - now.getTime() < 2 * 86_400_000;
                return (
                  <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <Link href={`/student/assignments/${a.id}`} className="min-w-0 flex-1 hover:underline">
                      <div className="font-bold">{a.title}</div><div className="text-xs text-muted">{a.class.subject.name}</div>
                    </Link>
                    <Chip tone={overdue ? "bad" : soon ? "warn" : "plain"}>{overdue ? "Overdue" : `Due ${fmtDate(a.dueAt)}`}</Chip>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="text-lg">Subject progress</h2>
          <ul className="flex flex-col gap-3">
            {d.progress.map(({ cls, scorePct, lessonsDone, lessonsTotal }) => (
              <li key={cls.id} className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between"><b>{cls.subject.name}</b><span className="tnum text-muted">{lessonsDone}/{lessonsTotal} lessons</span></div>
                <div className="flex items-center gap-2"><Bar value={scorePct ?? 0} /><span className="tnum w-10 text-right text-xs">{scorePct == null ? "–" : `${scorePct}%`}</span></div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Average of marked work. It shows what you&apos;ve practised, not how clever you are.</p>
        </section>

        <section className="card">
          <div className="flex items-center justify-between"><h2 className="text-lg">Achievements</h2><Link className="btn btn-sm" href="/student/for-you">My points</Link></div>
          <div className="flex flex-wrap gap-4 text-sm">
            <div><div className="tnum font-display text-2xl font-bold">{p.points}</div><div className="text-xs text-muted">points</div></div>
            <div><div className="tnum font-display text-2xl font-bold">{p.streak}</div><div className="text-xs text-muted">day streak</div></div>
            <div><div className="tnum font-display text-2xl font-bold">{p.badges.length}</div><div className="text-xs text-muted">badges</div></div>
          </div>
          {p.badges.length > 0 && <div className="flex flex-wrap gap-1.5">{p.badges.map((b) => <Chip key={b} tone="teal">🏅 {BADGES[b]?.label ?? b}</Chip>)}</div>}
          <p className="text-xs text-muted">Rewarding effort and improvement. No leaderboards.</p>
        </section>

        <section className="card">
          <h2 className="text-lg">Keep growing</h2>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {[
              ["/student/skills", "Reasoning skills", "Puzzle practice"],
              ["/student/growth", "My growth", "Check-in and goals"],
              ["/student/for-you", "For you", "Suggestions"],
              ["/student/buddy", "Study buddy", "Ask Nova for a hint"],
            ].map(([href, label, sub]) => (
              <li key={href}><Link href={href} className="flex h-full flex-col rounded-lg bg-surface-2 p-3 hover:bg-brand-soft"><b>{label}</b><span className="text-xs text-muted">{sub}</span></Link></li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2 className="text-lg">Recent results</h2>
          {d.graded.length === 0 ? <Empty title="No results yet" body="Marked work will show here." /> : (
            <ul className="flex flex-col divide-y divide-line">
              {d.graded.map((g) => {
                const pct = percent(g.finalScore, g.maxScore);
                return (
                  <li key={g.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 text-sm">
                    <Link href={`/student/assignments/${g.assignmentId}`} className="min-w-0 flex-1 hover:underline"><b>{g.assignment.title}</b><div className="text-xs text-muted">{g.assignment.class.subject.name}</div></Link>
                    {g.status === "GRADED" ? <Chip tone={scoreTone(pct)}>{g.finalScore}/{g.maxScore}</Chip> : <Chip>Being marked</Chip>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
