import { requireRole } from "@/lib/auth";
import { recordingFormClasses } from "@/lib/data-recordings";
import { liveSessionFor } from "@/lib/live";
import { MAX_DURATION_SEC, parseVideoUrl } from "@/lib/recordings";
import { Empty, PageHeader } from "@/components/ui";
import { RecordingForm } from "../RecordingForm";

export const metadata = { title: "New recording" };

export default async function NewRecording({ searchParams }: { searchParams: Promise<{ live?: string; video?: string; duration?: string }> }) {
  const s = await requireRole("TEACHER");
  const classes = await recordingFormClasses(s);
  if (!classes.length) return <Empty title="No classes yet" body="Ask your school admin to assign you a class." />;
  // From a live class: prefill the class and title. An Educop live recording
  // made in the browser also brings its uploaded video and length.
  const q = await searchParams;
  const liveId = q.live?.slice(0, 40);
  const live = liveId ? await liveSessionFor(s, liveId) : null;
  const fromLive = live && live.status !== "SCHEDULED" ? live : null;
  const video = fromLive && q.video ? parseVideoUrl(q.video.slice(0, 2000)) : null;
  const videoUrl = video && "url" in video && video.source === "upload" ? video.url : "";
  const d = Number(q.duration);
  const durationSec = videoUrl && Number.isInteger(d) && d > 0 && d <= MAX_DURATION_SEC ? d : null;
  return (
    <>
      <PageHeader eyebrow="Recorded classes" title="New recording"
        sub={videoUrl ? `Your recording of “${fromLive!.title}” is uploaded. Save it as a draft, add captions, chapters and questions, then publish it to the class.`
          : fromLive ? `The recording of your live class “${fromLive.title}”. Download it from Teams or Meet, then upload it here.` : "Upload a class video or link to one, then add captions, chapters and questions."} />
      <RecordingForm recordingId={null} classes={classes} uploadEnabled={!!process.env.BLOB_READ_WRITE_TOKEN} defaults={{
        classId: fromLive?.classId ?? classes[0].id, lessonId: "", liveSessionId: fromLive?.id ?? "",
        title: fromLive ? `Recording: ${fromLive.title}` : "", description: "", videoUrl, durationSec, captions: "",
        chapters: [{ time: "0:00", title: "Introduction" }], questions: [], published: false,
      }} />
    </>
  );
}
