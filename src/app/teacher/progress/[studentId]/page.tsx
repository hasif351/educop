import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { studentProgress } from "@/lib/teacher-insights";
import { percent } from "@/lib/grading";
import { gradeLabel } from "@/lib/ai-teacher";
import { Chip, Empty, PageHeader, fmtDate, scoreTone } from "@/components/ui";
import { HeatCell, HeatLegend, TREND_LABEL } from "../Heat";
import { KIND_LABEL, KIND_TONE } from "../../recommendations/kinds";

export const metadata = { title: "Student progress" };

const MOOD = ["", "Very low", "Low", "Okay", "Good", "Great"];
const REC_STATUS: Record<string, [string, "warn" | "good" | "teal" | "plain"]> = { PENDING_REVIEW: ["Awaiting review", "warn"], ACTIVE: ["Assigned", "good"], DONE: ["Done", "teal"], DISMISSED: ["Dismissed", "plain"] };

export default async function StudentProgressPage({ params }: { params: Promise<{ studentId: string }> }) {
  const s = await requireRole("TEACHER");
  const { studentId } = await params;
  const { student, stats, results, recs, cognitive, shared } = await studentProgress(s, studentId);
  const rows = stats.map((c) => ({ c, row: c.students.find((x) => x.id === student.id)! }));
  const sessions = cognitive.reduce((a, g) => a + g._count, 0);

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/teacher/progress" className="hover:underline">Student progress</Link>}
        title={student.name}
        sub={`${student.gradeLevel != null ? gradeLabel(student.gradeLevel) : "Student"} · ${stats.map((c) => c.name).join(", ")}`}
        actions={<Link className="btn" href={`/teacher/recommendations?student=${student.id}#new`}>New recommendation</Link>}
      />

      {rows.map(({ c, row }) => (
        <section key={c.id} className="card" aria-label={c.name}>
          <h2 className="text-lg">{c.name}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[["Average on marked work", row.avgPct == null ? "–" : `${row.avgPct}%`], ["Lessons completed", `${row.lessonsDone}/${row.lessonsTotal}`], ["Assignments missing", row.missing], ["Trend", row.trend ? TREND_LABEL[row.trend] : "–"]].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-surface-2 p-3"><div className="text-xs text-muted">{l}</div><div className="tnum font-display text-xl font-semibold">{v}</div></div>
            ))}
          </div>
          {c.objectives.length > 0 && <>
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base">Objectives</h3><HeatLegend /></div>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {c.objectives.map((o) => <li key={o.code} className="flex flex-col gap-1 text-xs"><span><b>{o.code}</b> · {o.title}</span><HeatCell cell={row.mastery[o.code]} /></li>)}
            </ul>
          </>}
          {row.reasons.length > 0 && <p className="rounded-lg bg-warn-soft p-3 text-sm text-warn"><b>Worth a check-in:</b> {row.reasons.join(" · ")}</p>}
        </section>
      ))}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card" aria-labelledby="results-h">
          <h2 id="results-h" className="text-lg">Results</h2>
          {results.length === 0 ? <Empty title="No handed-in work yet" body="Results from your classes appear here." /> : (
            <ul className="flex flex-col divide-y divide-line">
              {results.map((r) => {
                const pct = percent(r.finalScore, r.maxScore);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                    <Link className="min-w-0 flex-1 hover:underline" href={`/teacher/assignments/${r.assignment.id}/submissions/${r.id}`}><b>{r.assignment.title}</b><div className="text-xs text-muted">{r.assignment.class.name} · due {fmtDate(r.assignment.dueAt)}{r.daysLate ? ` · ${r.daysLate}d late` : ""}</div></Link>
                    {r.status === "GRADED" ? <Chip tone={scoreTone(pct)}>{r.finalScore}/{r.maxScore}</Chip> : <Chip tone="warn">Needs marking</Chip>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="recs-h">
          <h2 id="recs-h" className="text-lg">Recommendations</h2>
          {recs.length === 0 ? <Empty title="No recommendations" body="Suggestions appear after marking, or add one yourself." /> : (
            <ul className="flex flex-col gap-2">
              {recs.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 rounded-lg border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><Chip tone={KIND_TONE[r.kind] ?? "plain"}>{KIND_LABEL[r.kind] ?? r.kind}</Chip><Chip tone={REC_STATUS[r.status][1]}>{REC_STATUS[r.status][0]}</Chip><span className="text-xs text-muted">{fmtDate(r.createdAt)}</span></div>
                  <b>{r.title}</b>
                  {r.evidence[0] && <span className="text-xs text-muted">{r.evidence[0]}</span>}
                </li>
              ))}
            </ul>
          )}
          <Link className="btn btn-sm self-start" href="/teacher/recommendations">Review recommendations</Link>
        </section>

        <section className="card lg:col-span-2" aria-labelledby="sel-h">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="sel-h" className="text-lg">Reasoning skills and wellbeing summaries</h2><Chip tone="teal">Private to you</Chip></div>
          <p className="text-xs text-muted">Reasoning skills practice is for growth, not a measure of ability. Wellbeing check-ins are private to the student; you only see the ones they chose to share with you.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3 text-sm">
              <b>Reasoning skills practice</b>
              {sessions === 0 ? <span className="text-muted">No practice sessions completed yet.</span> : <>
                <span className="tnum">{sessions} session{sessions === 1 ? "" : "s"} completed</span>
                <ul className="flex flex-wrap gap-1.5">{cognitive.map((g) => <li key={g.domain}><Chip>{g.domain}: {g._count}</Chip></li>)}</ul>
              </>}
            </div>
            <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3 text-sm">
              <b>Shared check-ins</b>
              {shared.length === 0 ? <span className="text-muted">Nothing shared with you.</span> : (
                <ul className="flex flex-col gap-1.5">
                  {shared.map((c) => <li key={c.id}><span className="text-xs text-muted">{fmtDate(c.createdAt)}</span> · {MOOD[c.mood] ?? c.mood}{c.feelings.length ? ` · ${c.feelings.join(", ")}` : ""}{c.note ? <div className="text-xs">“{c.note}”</div> : null}</li>)}
                </ul>
              )}
            </div>
          </div>
          <p className="text-xs text-muted">Fuller skills and wellbeing summaries will appear here when those modules are connected.</p>
        </section>
      </div>
    </>
  );
}
