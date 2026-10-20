import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { recordingFormClasses, teacherRecording } from "@/lib/data-recordings";
import { fmtClock } from "@/lib/recordings";
import { PageHeader } from "@/components/ui";
import { RecordingForm } from "../../RecordingForm";

export const metadata = { title: "Edit recording" };

export default async function EditRecording({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("TEACHER");
  const rec = await teacherRecording(s, (await params).id.slice(0, 40));
  if (!rec) notFound();
  const classes = await recordingFormClasses(s);
  return (
    <>
      <PageHeader eyebrow={`Recorded classes · ${rec.class.name}`} title={`Edit: ${rec.title}`} sub="Changing a question keeps students' earlier answers to the questions you didn't change." />
      <RecordingForm recordingId={rec.id} classes={classes} uploadEnabled={!!process.env.BLOB_READ_WRITE_TOKEN} defaults={{
        classId: rec.classId, lessonId: rec.lessonId ?? "", liveSessionId: rec.liveSessionId ?? "", title: rec.title, description: rec.description,
        videoUrl: rec.videoUrl, durationSec: rec.durationSec, captions: rec.captionsVtt ?? "",
        chapters: rec.chapterList.map((c) => ({ time: fmtClock(c.t), title: c.title })),
        questions: rec.questionList.map((q) => ({ id: q.id, time: fmtClock(q.t), prompt: q.prompt, options: q.options, answerIndex: q.answerIndex, explanation: q.explanation })),
        published: rec.status === "PUBLISHED",
      }} />
    </>
  );
}
