import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { recordingAnalytics, teacherRecording } from "@/lib/data-recordings";
import { COMPLETE_PCT, fmtClock } from "@/lib/recordings";
import { Bar, Chip, PageHeader, fmtDate } from "@/components/ui";
import { VideoPlayer } from "@/components/media/VideoPlayer";
import { RecordingButtons } from "./RecordingButtons";

export const metadata = { title: "Recorded class" };

const SOURCE: Record<string, string> = { upload: "Uploaded file", link: "Video link", demo: "Demo video" };

export default async function TeacherRecording({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("TEACHER");
  const rec = await teacherRecording(s, (await params).id.slice(0, 40));
  if (!rec) notFound();
  const a = await recordingAnalytics(rec);
  const published = rec.status === "PUBLISHED";
  const peak = Math.max(1, ...a.dropOff);

  return (
    <>
      <PageHeader eyebrow={<>Recorded classes · {rec.class.name} · {published ? <Chip tone="good">Published</Chip> : <Chip>Draft</Chip>}</>} title={rec.title}
        sub={[SOURCE[rec.source] ?? rec.source, rec.durationSec ? fmtClock(rec.durationSec) : null, rec.publishedAt ? `published ${fmtDate(rec.publishedAt)}` : null].filter(Boolean).join(" · ")}
        actions={<><Link className="btn" href={`/teacher/recordings/${rec.id}/edit`}>Edit</Link><RecordingButtons id={rec.id} status={rec.status} /></>} />
      {(rec.description || rec.lesson || rec.liveSession) && (
        <div className="flex flex-col gap-1 text-sm">
          {rec.description && <p>{rec.description}</p>}
          {rec.lesson && <p className="text-muted">Lesson: <Link className="font-bold text-brand hover:underline" href={`/teacher/lessons/${rec.lesson.id}`}>{rec.lesson.title}</Link></p>}
          {rec.liveSession && <p className="text-muted">From the live class <Link className="font-bold text-brand hover:underline" href={`/teacher/live/${rec.liveSession.id}`}>{rec.liveSession.title}</Link></p>}
        </div>
      )}

      <section aria-labelledby="h-preview" className="flex flex-col gap-2">
        <h2 id="h-preview" className="text-lg">Preview</h2>
        <p className="text-sm text-muted">What students see. In the preview you can skip past questions, and nothing is saved.</p>
        <VideoPlayer mode="preview" src={rec.videoUrl} title={rec.title} poster={rec.posterUrl} captionsVtt={rec.captionsVtt}
          chapters={rec.chapterList} questions={rec.questionList} durationHint={rec.durationSec} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card overflow-x-auto" aria-labelledby="h-students">
          <h2 id="h-students" className="text-lg">Students</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-2">Student</th><th className="p-2">Watched</th><th className="p-2">Status</th>
              {a.questions.map((q) => <th key={q.id} className="p-2" title={q.prompt}>Q{q.n}</th>)}
            </tr></thead>
            <tbody>
              {a.students.map((st) => (
                <tr key={st.id} className="border-b border-line last:border-0">
                  <th scope="row" className="py-2 pr-2 text-left font-normal">{st.name}</th>
                  <td className="p-2"><div className="flex w-28 items-center gap-2"><Bar value={st.watchedPct} tone="teal" /><span className="tnum text-xs">{st.watchedPct}%</span></div></td>
                  <td className="p-2">{st.completedAt ? <Chip tone="good">Completed</Chip> : st.started ? <Chip tone="blue">Watching</Chip> : <Chip>Not started</Chip>}</td>
                  {a.questions.map((q) => {
                    const ans = st.answers[q.id];
                    return <td key={q.id} className="p-2">{!ans ? <span className="text-muted">–</span> : ans.correct ? <Chip tone="good">Right{ans.attempts > 1 ? ` (${ans.attempts} tries)` : ""}</Chip> : <Chip tone="warn">Wrong</Chip>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted">Completed means watched at least {COMPLETE_PCT}% (skipped parts don&apos;t count) and answered every question.</p>
        </section>

        <div className="flex flex-col gap-6">
          <section className="card" aria-labelledby="h-questions">
            <h2 id="h-questions" className="text-lg">Questions</h2>
            {a.questions.length === 0 ? <p className="text-sm text-muted">No questions in this video. Add some with Edit.</p> : (
              <ul className="flex flex-col gap-3 text-sm">
                {a.questions.map((q) => (
                  <li key={q.id} className="flex flex-col gap-1">
                    <div className="flex justify-between gap-2"><span><b>Q{q.n}</b> <span className="tnum text-muted">at {fmtClock(q.t)}</span> · {q.prompt}</span>
                      <span className="tnum shrink-0 text-xs text-muted">{q.pct == null ? "No answers" : `${q.pct}% right · ${q.answered} answered`}</span></div>
                    <Bar value={q.pct ?? 0} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card" aria-labelledby="h-drop">
            <h2 id="h-drop" className="text-lg">Where students stop watching</h2>
            {a.viewers === 0 ? <p className="text-sm text-muted">This fills in once students start watching.</p> : (
              <>
                <div className="flex h-24 items-end gap-0.5" role="img" aria-label={`Share of the ${a.viewers} viewers who watched each part of the video: ${a.dropOff.map((v, i) => `part ${i + 1} ${v}%`).join(", ")}`}>
                  {a.dropOff.map((v, i) => <div key={i} className="flex-1 rounded-t bg-teal" style={{ height: `${Math.max(2, (v / peak) * 100)}%`, opacity: v ? 1 : 0.25 }} />)}
                </div>
                <div className="tnum flex justify-between text-xs text-muted"><span>0:00</span><span>{rec.durationSec ? fmtClock(rec.durationSec) : "end"}</span></div>
                <p className="text-xs text-muted">Each bar is the share of the {a.viewers} student{a.viewers === 1 ? "" : "s"} who watched that part. Class totals only.</p>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
