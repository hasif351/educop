import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { REC_TABS, recFormOptions, teacherRecommendations } from "@/lib/teacher-insights";
import { Chip, Empty, PageHeader, fmtDate } from "@/components/ui";
import { KIND_LABEL, KIND_TONE, NOTE_PREFIX } from "./kinds";
import { RecActions } from "./RecActions";
import { NewRecForm } from "./NewRecForm";

export const metadata = { title: "Recommendations" };

const PIPELINE = ["Collect permitted data", "Find gaps & strengths", "Match a next step", "Explain the suggestion", "Teacher review", "Assign to dashboard", "Track outcomes", "Adjust next time"];
const DATA_USED: [string, string, "good" | "warn" | "bad"][] = [
  ["Quiz & assessment results", "Yes", "good"], ["Lesson completion", "Yes", "good"], ["Teacher notes", "Yes", "good"],
  ["Voluntary self-reflection", "If shared", "warn"], ["Camera, voice or facial data", "Never", "bad"],
];

export default async function TeacherRecommendations({ searchParams }: { searchParams: Promise<{ status?: string; student?: string }> }) {
  const s = await requireRole("TEACHER");
  const sp = await searchParams;
  const tab = REC_TABS.find((t) => t.key === sp.status) ?? REC_TABS[0];
  const [{ list, counts, lessons }, classes] = await Promise.all([teacherRecommendations(s, tab.status), recFormOptions(s)]);

  return (
    <>
      <PageHeader eyebrow="Suggestion engine" title="Recommendations" sub="Every suggestion shows the evidence it used. Stretch work and group suggestions wait for your review before students see them." actions={<a className="btn-primary" href="#new">New recommendation</a>} />

      <section className="card" aria-labelledby="pipe-h">
        <h2 id="pipe-h" className="text-lg">How a recommendation is made</h2>
        <ol className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {PIPELINE.map((p, i) => <li key={p} className="rounded-lg bg-surface-2 p-2.5"><span className="eyebrow block">Step {i + 1}</span>{p}</li>)}
        </ol>
      </section>

      <nav aria-label="Recommendation status" className="flex flex-wrap gap-2">
        {REC_TABS.map((t) => (
          <Link key={t.key} href={`/teacher/recommendations?status=${t.key}`} aria-current={t.key === tab.key ? "page" : undefined}
            className={t.key === tab.key ? "btn-primary btn-sm" : "btn btn-sm"}>
            {t.label} <span className="tnum">({counts.get(t.status) ?? 0})</span>
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {list.length === 0 ? <Empty title={`Nothing in “${tab.label}”`} body="Suggestions appear here after marking, or when you add one." /> : list.map((r) => {
            const notes = r.evidence.filter((e) => e.startsWith(NOTE_PREFIX));
            const facts = r.evidence.filter((e) => !e.startsWith(NOTE_PREFIX));
            return (
              <article key={r.id} className="card" aria-label={`${r.title} for ${r.student.name}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2"><Chip tone={KIND_TONE[r.kind] ?? "plain"}>{KIND_LABEL[r.kind] ?? r.kind}</Chip><span className="text-xs text-muted">{fmtDate(r.createdAt)}</span></div>
                  {r.status === "PENDING_REVIEW" ? <Chip tone="warn">Awaiting your review</Chip> : r.status === "ACTIVE" ? <Chip tone="good">Assigned</Chip> : r.status === "DONE" ? <Chip tone="teal">Done</Chip> : <Chip>Dismissed</Chip>}
                </div>
                <h3 className="text-base">{r.title}</h3>
                <p className="text-sm">For <Link className="font-bold hover:underline" href={`/teacher/progress/${r.student.id}`}>{r.student.name}</Link>{r.lessonId && lessons.get(r.lessonId) ? <> · lesson: {lessons.get(r.lessonId)}</> : null}</p>
                <div className="rounded-lg bg-surface-2 p-3 text-sm">
                  <b>Evidence</b>
                  <ul className="ml-4 list-disc">{facts.map((e, i) => <li key={i}>{e}</li>)}</ul>
                  {notes.map((n, i) => <p key={i} className="mt-1"><i>{n}</i></p>)}
                  <p className="mt-1 text-xs text-muted">Patterns in results suggest a need. They don&apos;t prove the cause. Use your judgement.</p>
                </div>
                <RecActions rec={{ id: r.id, status: r.status, title: r.title, kind: r.kind, note: notes[0]?.slice(NOTE_PREFIX.length) ?? "" }} />
              </article>
            );
          })}
        </div>

        <div className="flex flex-col gap-6">
          <section className="card" aria-labelledby="data-h">
            <h2 id="data-h" className="text-lg">Data used</h2>
            <ul className="flex flex-col divide-y divide-line text-sm">
              {DATA_USED.map(([a, b, t]) => <li key={a} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"><span>{a}</span><Chip tone={t}>{b}</Chip></li>)}
            </ul>
          </section>
          <section id="new" className="card scroll-mt-24" aria-labelledby="new-h">
            <h2 id="new-h" className="text-lg">New recommendation</h2>
            <p className="text-xs text-muted">For one student or a group. Students see it on their dashboard once it is assigned.</p>
            <NewRecForm classes={classes.map((c) => ({ id: c.id, name: c.name, students: c.enrollments.map((e) => e.student), lessons: c.lessons }))} preselect={sp.student ?? ""} />
          </section>
        </div>
      </div>
    </>
  );
}
