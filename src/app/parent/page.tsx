import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { childOverview, homeLearningInputs, parentChildList, pendingChildLinks } from "@/lib/data-parent";
import { percent } from "@/lib/grading";
import { homeActivities } from "@/lib/home-learning";
import { BADGES } from "@/lib/points";
import { gradeLabel } from "@/lib/roster";
import { Bar, Chip, Empty, PageHeader, fmtDate, fmtTime, scoreTone } from "@/components/ui";
import { ChildSwitcher } from "./ChildSwitcher";

export const metadata = { title: "My children" };

const KIND_LABEL: Record<string, string> = { REVIEW: "Review", PRACTICE: "Practice", CHALLENGE: "Challenge" };
const MOOD = ["", "Low", "A bit low", "Okay", "Good", "Great"];

export default async function ParentHome({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const s = await requireRole("PARENT");
  const [kids, pendingLinks] = await Promise.all([parentChildList(s), pendingChildLinks(s)]);
  const first = s.name.split(" ")[0];
  const header = <PageHeader eyebrow="Parent portal" title={`Hello, ${first}`} sub="How each of your children is getting on, in plain language." actions={<Link className="btn" href="/parent/messages">Message a teacher</Link>} />;
  const pendingNote = pendingLinks > 0 && <p role="status" className="rounded-lg bg-warn-soft px-4 py-2 text-sm text-warn">{pendingLinks} child link{pendingLinks === 1 ? " is" : "s are"} waiting for the school to verify. You&apos;ll see their learning once it&apos;s verified.</p>;
  if (kids.length === 0) {
    return <>{header}{pendingNote}<Empty title="No linked children yet" body="Your school verifies parent–child links. Contact the school office if a child is missing." /></>;
  }

  const wanted = (await searchParams).child;
  if (wanted && !kids.some((k) => k.id === wanted)) notFound();
  const childId = wanted ?? kids[0].id;
  const [d, home] = await Promise.all([childOverview(s, childId), homeLearningInputs(s, childId)]);
  const name = d.child.name.split(" ")[0];
  const now = new Date();
  const teachers = [...new Set(d.classes.map((c) => c.teacher.name))];
  const todayDone = d.todayLessons.filter((l) => l.progress[0]?.completedAt).length;
  const latestFeedback = d.graded.find((g) => g.feedback);
  const activities = homeActivities(home.recs, home.lessons).slice(0, 3);

  return (
    <>
      {header}
      {pendingNote}
      <ChildSwitcher kids={kids} selected={childId} base="/parent" />

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-brand-soft to-teal-soft p-6">
        <div>
          <h2 className="text-2xl">{name}&apos;s overview</h2>
          <p className="text-muted">{gradeLabel(d.child.gradeLevel)} · {d.classes.map((c) => c.name).join(", ") || "No classes yet"}</p>
          {teachers.length > 0 && <p className="text-sm text-muted">Teachers: {teachers.join(", ")}</p>}
        </div>
        <ul className="flex flex-wrap gap-2 text-sm font-bold" aria-label="At a glance">
          <li className="rounded-full bg-surface px-3 py-1">{d.todayLessons.length ? `${todayDone} of ${d.todayLessons.length} lessons done today` : "No lessons today"}</li>
          <li className="rounded-full bg-surface px-3 py-1">{d.upcomingWork.length} assignment{d.upcomingWork.length === 1 ? "" : "s"} coming up</li>
          {d.live.held > 0 && <li className="rounded-full bg-surface px-3 py-1">Live classes {d.live.attended}/{d.live.held}</li>}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="text-lg">Today&apos;s lessons</h2>
          {d.todayLessons.length === 0 ? <p className="text-sm text-muted">No lessons scheduled today.</p> : (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {d.todayLessons.map((l) => {
                const p = l.progress[0];
                const pct = Math.round(((p?.completedSteps.length ?? 0) / 8) * 100);
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="tnum w-12 text-muted">{fmtTime(l.scheduledFor)}</span>
                    <div className="min-w-0 flex-1"><b>{l.title}</b><div className="text-xs text-muted">{l.class.subject.name} · {l.durationMin} min</div></div>
                    <div className="flex w-28 items-center gap-2"><Bar value={pct} tone="teal" /><span className="tnum text-xs">{pct}%</span></div>
                    {p?.completedAt ? <Chip tone="good">Done</Chip> : <Chip>{pct ? "In progress" : "Not started"}</Chip>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="text-lg">Coming up</h2>
          {d.upcomingWork.length === 0 && d.live.upcoming.length === 0 ? <p className="text-sm text-muted">Nothing due.</p> : (
            <ul className="flex flex-col gap-2 text-sm">
              {d.live.upcoming.map((l) => <li key={l.id} className="flex justify-between gap-2"><span>Live class: {l.title}</span><span className="tnum shrink-0 text-muted">{fmtDate(l.startsAt, { weekday: "short" })} {fmtTime(l.startsAt)}</span></li>)}
              {d.upcomingWork.map((a) => {
                const soon = a.dueAt.getTime() - now.getTime() < 2 * 86_400_000;
                return <li key={a.id} className="flex justify-between gap-2"><span>{a.title} <span className="text-muted">· {a.class.subject.name}</span></span><span className="shrink-0">{soon ? <Chip tone="warn">Due {fmtDate(a.dueAt, { weekday: "short" })}</Chip> : <span className="tnum text-muted">{fmtDate(a.dueAt)}</span>}</span></li>;
              })}
            </ul>
          )}
          {d.missing.length > 0 && (
            <div className="rounded-lg bg-warn-soft p-3 text-sm">
              <b className="text-warn">Not handed in yet</b>
              <ul className="mt-1 flex flex-col gap-1">{d.missing.map((a) => <li key={a.id}>{a.title} <span className="text-muted">· was due {fmtDate(a.dueAt)}</span></li>)}</ul>
              <p className="mt-1 text-xs text-muted">Late work may still be accepted. Check with the teacher.</p>
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="text-lg">Recent results</h2>
          {d.graded.length === 0 ? <p className="text-sm text-muted">No marked work yet.</p> : (
            <ul className="flex flex-col gap-2.5 text-sm">{d.graded.map((g) => (
              <li key={g.id} className="flex flex-col gap-0.5">
                <div className="flex justify-between gap-2"><span>{g.assignment.class.subject.name} · {g.assignment.title}</span><Chip tone={scoreTone(percent(g.finalScore, g.maxScore))}>{g.finalScore}/{g.maxScore}</Chip></div>
                {g.feedback && <span className="text-xs text-muted">{g.teacher ?? "Teacher"}: “{g.feedback}”</span>}
              </li>
            ))}</ul>
          )}
          <p className="text-xs text-muted">A lower score shows what to practise next. It&apos;s a normal part of learning.</p>
        </section>

        <section className="card">
          <h2 className="text-lg">Teacher feedback</h2>
          {latestFeedback ? (
            <p className="rounded-lg bg-surface-2 p-3 text-sm"><b>{latestFeedback.teacher ?? "Teacher"}{latestFeedback.gradedAt ? `, ${fmtDate(latestFeedback.gradedAt, { day: "numeric", month: "short" })}` : ""}:</b> “{latestFeedback.feedback}”</p>
          ) : <p className="text-sm text-muted">Written feedback appears here when work is marked.</p>}
          <Link className="btn btn-sm self-start" href="/parent/messages">Message teacher</Link>
        </section>

        <section className="card">
          <h2 className="text-lg">Subject progress</h2>
          {d.progress.length === 0 ? <p className="text-sm text-muted">No classes yet.</p> : (
            <ul className="flex flex-col gap-3 text-sm">{d.progress.map((p) => (
              <li key={p.cls.id} className="flex flex-col gap-1">
                <div className="flex justify-between gap-2"><span className="font-bold">{p.cls.subject.name}</span><span className="tnum text-xs text-muted">{p.lessonsDone}/{p.lessonsTotal} lessons{p.scorePct != null ? ` · ${p.scorePct}% average` : ""}</span></div>
                <Bar value={p.lessonsTotal ? (p.lessonsDone / p.lessonsTotal) * 100 : 0} tone="teal" />
              </li>
            ))}</ul>
          )}
        </section>

        <section className="card">
          <h2 className="text-lg">Suggested next steps</h2>
          {d.recs.length === 0 ? <p className="text-sm text-muted">The teacher adds suggestions after work is marked.</p> : (
            <ul className="flex flex-col gap-2 text-sm">{d.recs.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 rounded-lg bg-surface-2 p-3">
                <div><Chip tone={r.kind === "REVIEW" ? "warn" : r.kind === "CHALLENGE" ? "good" : "blue"}>{KIND_LABEL[r.kind] ?? r.kind}</Chip></div>
                <b>{r.title}</b>
                {r.evidence.length > 0 && <details className="text-xs text-muted"><summary className="cursor-pointer">Why?</summary><ul className="mt-1 list-disc pl-4">{r.evidence.map((e) => <li key={e}>{e}</li>)}</ul></details>}
              </li>
            ))}</ul>
          )}
        </section>

        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between gap-2"><h2 className="text-lg">Home activities</h2><Link className="btn btn-sm" href={`/parent/home-learning?child=${childId}`}>All activities</Link></div>
          {activities.length === 0 ? <p className="text-sm text-muted">Ideas appear here once this week&apos;s lessons are published.</p> : (
            <ul className="grid gap-3 sm:grid-cols-3">{activities.map((a) => (
              <li key={a.key} className="flex flex-col gap-1.5 rounded-lg bg-surface-2 p-3 text-sm">
                <span><Chip tone="teal">{a.minutes} min</Chip></span><b>{a.title}</b><span className="text-muted">{a.body}</span>
              </li>
            ))}</ul>
          )}
        </section>

        <section className="card">
          <h2 className="text-lg">Live classes</h2>
          {d.live.held === 0 ? <p className="text-sm text-muted">No live classes have taken place yet.</p> : (
            <>
              <p className="text-sm">Joined <b className="tnum">{d.live.attended}</b> of <b className="tnum">{d.live.held}</b> live classes.</p>
              <Bar value={(d.live.attended / d.live.held) * 100} tone="teal" />
            </>
          )}
          <p className="text-xs text-muted">Based on joining the online class. School attendance is recorded separately by the school.</p>
        </section>

        <section className="card">
          <h2 className="text-lg">Wellbeing</h2>
          {d.wellbeing.length === 0 ? (
            <p className="text-sm text-muted">{name}&apos;s wellbeing check-ins are private. You&apos;ll only see a check-in here if {name} chooses to share it. If you have a concern, talk with {name} or the class teacher.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2 text-sm">{d.wellbeing.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center gap-2">
                  <span className="tnum w-16 text-muted">{fmtDate(w.createdAt, { day: "numeric", month: "short" })}</span>
                  <Chip tone={w.mood >= 4 ? "good" : w.mood === 3 ? "blue" : "warn"}>{MOOD[w.mood] ?? "–"}</Chip>
                  {w.feelings.length > 0 && <span className="text-muted">{w.feelings.join(", ")}</span>}
                </li>
              ))}</ul>
              <p className="text-xs text-muted">Only check-ins {name} chose to share. Notes stay private.</p>
            </>
          )}
        </section>

        <section className="card">
          <h2 className="text-lg">Achievements</h2>
          {d.badges.length === 0 ? <p className="text-sm text-muted">Badges for effort appear here.</p> : (
            <ul className="flex flex-wrap gap-2">{d.badges.map((b) => <li key={b.badge}><Chip tone="teal">{BADGES[b.badge]?.label ?? b.badge}</Chip></li>)}</ul>
          )}
        </section>
      </div>
    </>
  );
}
