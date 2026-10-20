import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { classStats } from "@/lib/teacher-insights";
import { classSelSummary, classSkillsSummary } from "@/lib/data-student-modules";
import { Chip, Empty, PageHeader, scoreTone } from "@/components/ui";
import { HeatCell, HeatLegend, TREND_LABEL } from "./Heat";

export const metadata = { title: "Student progress" };

export default async function TeacherProgress({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const s = await requireRole("TEACHER");
  const sp = await searchParams;
  const all = (await classStats(s)).filter((c) => c.students.length > 0);
  if (all.length === 0) return (<><PageHeader eyebrow="Student progress" title="Student progress" /><Empty title="No students yet" body="Progress appears once students are enrolled in your classes." /></>);
  const c = all.find((x) => x.id === sp.class) ?? all[0];
  const support = c.students.filter((st) => st.reasons.length > 0);
  const [sel, skills] = await Promise.all([classSelSummary(s, c.id), classSkillsSummary(s, c.id)]);

  return (
    <>
      <PageHeader eyebrow={`Student progress · ${c.subject}`} title={c.name} sub="Results from marked work and lessons in your class. A support tool for your judgement, not a ranking." />
      {all.length > 1 && (
        <nav aria-label="Classes" className="flex flex-wrap gap-2">
          {all.map((x) => <Link key={x.id} href={`/teacher/progress?class=${x.id}`} aria-current={x.id === c.id ? "page" : undefined} className={x.id === c.id ? "btn-primary btn-sm" : "btn btn-sm"}>{x.name}</Link>)}
        </nav>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[["Students", c.students.length], ["Class average", c.avgPct == null ? "–" : `${c.avgPct}%`], ["Lessons taught", c.students[0]?.lessonsTotal ?? 0], ["May need a check-in", support.length]].map(([l, v]) => (
          <div key={l} className="rounded-card border border-line bg-surface p-4"><div className="text-xs text-muted">{l}</div><div className="tnum font-display text-2xl font-semibold">{v}</div></div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card overflow-x-auto lg:col-span-2" aria-labelledby="students-h">
          <h2 id="students-h" className="text-lg">Students</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-3">Student</th><th className="py-2 pr-3">Average</th><th className="py-2 pr-3">Lessons</th><th className="py-2 pr-3">Missing</th><th className="py-2">Trend</th></tr></thead>
            <tbody>
              {c.students.map((st) => (
                <tr key={st.id} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-3"><Link className="font-bold hover:underline" href={`/teacher/progress/${st.id}`}>{st.name}</Link></td>
                  <td className="tnum py-2.5 pr-3">{st.avgPct == null ? <span className="text-muted">–</span> : <Chip tone={scoreTone(st.avgPct)}>{st.avgPct}%</Chip>}</td>
                  <td className="tnum py-2.5 pr-3">{st.lessonsDone}/{st.lessonsTotal}</td>
                  <td className="tnum py-2.5 pr-3">{st.missing ? <Chip tone="warn">{st.missing}</Chip> : <span className="text-muted">0</span>}</td>
                  <td className="py-2.5 text-xs">{st.trend ? TREND_LABEL[st.trend] : <span className="text-muted">Not enough results</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card" aria-labelledby="support-h">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="support-h" className="text-lg">Students who may need a check-in</h2><Chip tone="teal">Private to you</Chip></div>
          {support.length === 0 ? <Empty title="No one flagged" body="Marked work, hand-ins and shared check-ins look fine for everyone." /> : (
            <ul className="flex flex-col gap-3">
              {support.map((st) => (
                <li key={st.id} className="rounded-lg border border-line p-3 text-sm">
                  <Link className="font-bold hover:underline" href={`/teacher/progress/${st.id}`}>{st.name}</Link>
                  <ul className="ml-4 list-disc text-xs text-muted">{st.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </li>
              ))}
            </ul>
          )}
          <p className="rounded-lg bg-surface-2 p-3 text-xs text-muted">Based on classwork and what students chose to share. Not a judgement of attention or effort. Consider connectivity, language and access needs.</p>
        </section>

        <section className="card overflow-x-auto lg:col-span-3" aria-labelledby="heat-h">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="heat-h" className="text-lg">Objective mastery</h2><HeatLegend /></div>
          <p className="text-xs text-muted">By lesson outcome code, from marked assignments linked to each lesson plus its knowledge check. Secure means 70% or above.</p>
          {c.objectives.length === 0 ? <Empty title="No outcome codes yet" body="Add a curriculum outcome code to your lessons to see mastery by objective." /> : (
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="py-2 pr-3 font-bold uppercase tracking-wide">Student</th>
                  {c.objectives.map((o) => <th scope="col" key={o.code} className="px-1 py-2 align-bottom font-normal"><b className="block text-fg">{o.code}</b>{o.title}<span className="block tnum">{o.withData ? `${o.secure}/${o.withData} secure` : "no data yet"}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {c.students.map((st) => (
                  <tr key={st.id}>
                    <th scope="row" className="py-1 pr-3 text-left font-bold">{st.name}</th>
                    {c.objectives.map((o) => <td key={o.code} className="px-1 py-1"><HeatCell cell={st.mastery[o.code]} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card lg:col-span-2" aria-labelledby="skills-h">
          <h2 id="skills-h" className="text-lg">Reasoning skills practice</h2>
          <p className="text-xs text-muted">Last {skills.days} days. Practice for growth, not a measure of ability. Class figures appear once {skills.minGroup} or more students have practised a skill.</p>
          <ul className="flex flex-col gap-2 text-sm">
            {skills.domains.map((d) => (
              <li key={d.domain} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{d.label}</span>
                <span className="tnum text-muted">{d.sets} set{d.sets === 1 ? "" : "s"} · {d.students} student{d.students === 1 ? "" : "s"}{d.solvedPct != null ? ` · ${d.solvedPct}% of puzzles solved` : ""}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card" aria-labelledby="wellbeing-h">
          <h2 id="wellbeing-h" className="text-lg">Class wellbeing</h2>
          <p className="text-xs text-muted">Last {sel.days} days, anonymous. Shown only when {sel.minGroup} or more students checked in.</p>
          {sel.aggregate ? (
            <div className="flex flex-col gap-1 text-sm">
              <span className="tnum">Average mood {sel.aggregate.averageMood} / 5 from {sel.aggregate.students} students</span>
              {sel.aggregate.topFeelings.length > 0 && <ul className="flex flex-wrap gap-1.5">{sel.aggregate.topFeelings.map((f) => <li key={f.feeling}><Chip>{f.feeling} · {f.count}</Chip></li>)}</ul>}
            </div>
          ) : <p className="text-sm text-muted">Not enough check-ins yet to show a class picture.</p>}
          <p className="text-sm"><b className="tnum">{sel.shared.length}</b> check-in{sel.shared.length === 1 ? "" : "s"} shared with you. Open a student to read theirs.</p>
        </section>
      </div>
    </>
  );
}
