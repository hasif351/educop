import { requireRole } from "@/lib/auth";
import { recordingFormClasses } from "@/lib/data-recordings";
import { liveSessionFor } from "@/lib/live";
import { Empty, PageHeader } from "@/components/ui";
import { RecordingForm } from "../RecordingForm";

export const metadata = { title: "New recording" };

export default async function NewRecording({ searchParams }: { searchParams: Promise<{ live?: string }> }) {
  const s = await requireRole("TEACHER");
  const classes = await recordingFormClasses(s);
  if (!classes.length) return <Empty title="No classes yet" body="Ask your school admin to assign you a class." />;
  // From an ended live class: prefill the class and title.
  const liveId = (await searchParams).live?.slice(0, 40);
  const live = liveId ? await liveSessionFor(s, liveId) : null;
  const fromLive = live && live.status === "ENDED" ? live : null;
  return (
    <>
      <PageHeader eyebrow="Recorded classes" title="New recording"
        sub={fromLive ? `The recording of your live class “${fromLive.title}”. Download it from Teams or Meet, then upload it here.` : "Upload a class video or link to one, then add captions, chapters and questions."} />
      <RecordingForm recordingId={null} classes={classes} uploadEnabled={!!process.env.BLOB_READ_WRITE_TOKEN} defaults={{
        classId: fromLive?.classId ?? classes[0].id, lessonId: "", liveSessionId: fromLive?.id ?? "",
        title: fromLive ? `Recording: ${fromLive.title}` : "", description: "", videoUrl: "", durationSec: null, captions: "",
        chapters: [{ time: "0:00", title: "Introduction" }], questions: [], published: false,
      }} />
    </>
  );
}
