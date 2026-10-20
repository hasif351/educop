import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { liveSessionFor, liveState } from "@/lib/live";
import { minutesAttended, tallyPoll, videoFor } from "@/lib/live-utils";
import { Chip, PageHeader, fmtDate, fmtTime } from "@/components/ui";
import { LiveRoom } from "@/components/live/LiveRoom";

export const metadata = { title: "Live class" };

export default async function StudentLiveSession({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("STUDENT");
  const session = await liveSessionFor(s, (await params).id);
  if (!session) notFound();

  if (session.status === "ENDED") {
    const [mine, polls] = await Promise.all([
      db.liveAttendance.findUnique({ where: { sessionId_userId: { sessionId: session.id, userId: s.userId } } }),
      db.livePoll.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" } }),
    ]);
    return (
      <>
        <PageHeader eyebrow={`Class ended · ${session.cls.name}`} title={session.title} sub={`${fmtDate(session.startsAt)} ${fmtTime(session.startsAt)} with ${session.teacher.name}`}
          actions={<Link className="btn" href="/student/live">Back to live classes</Link>} />
        <section className="card">
          <h2 className="text-lg">Your attendance</h2>
          {mine ? <p className="text-sm"><Chip tone="good">You were there</Chip> Joined at {fmtTime(mine.joinedAt)}, about {minutesAttended(mine.joinedAt, mine.lastSeenAt)} min.</p>
            : <p className="text-sm text-muted">You didn&apos;t join this class. Ask your teacher what you missed.</p>}
        </section>
        {polls.length > 0 && (
          <section className="card">
            <h2 className="text-lg">Class polls</h2>
            {polls.map((p) => { const { counts, total } = tallyPoll(p.options, p.votes); return (
              <div key={p.id} className="text-sm"><b>{p.question}</b>
                <ul className="mt-1">{p.options.map((o, i) => <li key={i} className="flex justify-between gap-2"><span>{o}</span><span className="tnum text-muted">{counts[i]}</span></li>)}</ul>
                <span className="text-xs text-muted">{total} responses</span></div>
            ); })}
          </section>
        )}
      </>
    );
  }

  return (
    <LiveRoom id={session.id} role="STUDENT" title={session.title} className={session.cls.name} host={session.teacher.name}
      video={videoFor(session, s.name)} initial={await liveState(s, session.id)} />
  );
}
