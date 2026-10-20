import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { studentRecording } from "@/lib/data-recordings";
import { readPrefs } from "@/lib/prefs";
import { COMPLETE_PCT, RECORDING_POINTS } from "@/lib/recordings";
import { PageHeader, fmtDate } from "@/components/ui";
import { VideoPlayer } from "@/components/media/VideoPlayer";
import { answerQuestion, saveProgress } from "../actions";

export const metadata = { title: "Recorded class" };

export default async function StudentRecording({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("STUDENT");
  const rec = await studentRecording(s, (await params).id.slice(0, 40));
  if (!rec) notFound();
  const me = await db.user.findUnique({ where: { id: s.userId }, select: { prefs: true } });
  const prefs = readPrefs(me?.prefs);

  return (
    <>
      <PageHeader eyebrow={`Recorded class · ${rec.class.name}`} title={rec.title}
        sub={`${rec.teacher.name}${rec.publishedAt ? ` · ${fmtDate(rec.publishedAt)}` : ""}`}
        actions={<Link className="btn" href="/student/recordings">All recorded classes</Link>} />
      {rec.description && <p className="text-sm">{rec.description}</p>}
      <VideoPlayer mode="student" src={rec.videoUrl} title={rec.title} poster={rec.posterUrl} captionsVtt={rec.captionsVtt} captionsDefault={prefs.a11y.captions}
        chapters={rec.chapterList} questions={rec.questionList} durationHint={rec.durationSec} initial={rec.progress}
        onProgress={saveProgress.bind(null, rec.id)} onAnswer={answerQuestion.bind(null, rec.id)} />
      <p className="text-xs text-muted">
        Watch at least {COMPLETE_PCT}% and answer every question to complete this video and earn {RECORDING_POINTS} points. Skipping ahead doesn&apos;t count as watching.
        {rec.lesson?.status === "PUBLISHED" && <> Next: <Link className="font-bold text-brand hover:underline" href={`/student/lessons/${rec.lesson.id}`}>{rec.lesson.title}</Link>.</>}
      </p>
    </>
  );
}
