import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { RecordingStudio } from "@/components/media/RecordingStudio";

export const metadata = { title: "Recording studio" };

export default async function Studio() {
  await requireRole("TEACHER");
  return (
    <>
      <PageHeader eyebrow="Recorded classes" title="Recording studio"
        sub="Record a class from your camera, your screen or a whiteboard. Switch between them and write over any of them while you record, then save it as a recorded class." />
      <RecordingStudio uploadEnabled={!!process.env.BLOB_READ_WRITE_TOKEN} />
    </>
  );
}
