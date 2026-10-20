import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { liveSessionFor, liveState } from "@/lib/live";
import { videoFor, type VideoProvider } from "@/lib/live-utils";
import { MeetingLinkForm } from "@/components/live/MeetingLinkForm";
import { PageHeader, fmtDate, fmtTime } from "@/components/ui";
import { Icon } from "@/components/icons";
import { LiveRoom } from "@/components/live/LiveRoom";
import { AttendanceReport } from "@/components/live/AttendanceReport";
import { startLive } from "../actions";

export const metadata = { title: "Virtual classroom" };

export default async function TeacherLiveSession({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("TEACHER");
  const session = await liveSessionFor(s, (await params).id);
  if (!session) notFound();
  const when = `${fmtDate(session.startsAt)} ${fmtTime(session.startsAt)} · ${session.durationMin} min`;

  if (session.status === "ENDED") return (
    <>
      <PageHeader eyebrow={`Class ended${session.endedAt ? ` · ${fmtTime(session.endedAt)}` : ""} · ${session.cls.name}`} title={`Class summary: ${session.title}`} sub={when}
        actions={<><Link className="btn-primary" href={`/teacher/recordings/new?live=${session.id}`}><Icon name="film" /> Add the class recording</Link><Link className="btn" href="/teacher/live">Back to virtual classroom</Link></>} />
      <p className="text-sm text-muted">Recorded the class in Teams or Meet? Download the recording, then add it with “Add the class recording” so students can watch it with captions, chapters and questions.</p>
      <AttendanceReport sessionId={session.id} classId={session.classId} />
    </>
  );

  if (session.status === "SCHEDULED") return (
    <>
      <PageHeader eyebrow={`Virtual classroom · ${session.cls.name}`} title={session.title} sub={`${when} · Host: ${session.teacher.name}`}
        actions={<form action={startLive.bind(null, session.id)}><button className="btn-teal"><Icon name="video" /> Start class</button></form>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="text-lg">Before you start</h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            <li>Starting the class notifies every student in {session.cls.name}.</li>
            <li>Students join from <b>Live class</b> in their menu. Attendance is recorded when they join.</li>
            <li>Chat messages with phone numbers, emails or links are held until you approve them.</li>
            <li>Run quick polls and see results live. Students see results when you end a poll.</li>
          </ul>
        </section>
        <section className="card">
          <h2 className="text-lg">Video</h2>
          <MeetingLinkForm id={session.id} provider={session.provider as VideoProvider} meetingUrl={session.meetingUrl ?? ""} />
        </section>
        <section className="card">
          <h2 className="text-lg">Secure join link</h2>
          <p className="break-all rounded-lg bg-surface-2 p-2 font-mono text-xs">/student/live/{session.id}</p>
          <p className="text-sm text-muted">Only enrolled students signed in to the school account can open it. The video room name is a long random code that is never shown to anyone outside the class.</p>
        </section>
      </div>
    </>
  );

  return (
    <LiveRoom id={session.id} role="TEACHER" title={session.title} className={session.cls.name} host={session.teacher.name}
      video={videoFor(session, s.name)} initial={await liveState(s, session.id)} />
  );
}
