import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { studentLiveSessions } from "@/lib/live";
import { Chip, Empty, PageHeader, fmtDate, fmtTime } from "@/components/ui";

export const metadata = { title: "Live class" };

export default async function StudentLive() {
  const s = await requireRole("STUDENT");
  const sessions = await studentLiveSessions(s);
  const live = sessions.filter((x) => x.status === "LIVE");
  const upcoming = sessions.filter((x) => x.status === "SCHEDULED");
  const past = sessions.filter((x) => x.status === "ENDED").reverse().slice(0, 10);
  const row = (x: (typeof sessions)[number], cta: React.ReactNode) => (
    <li key={x.id} className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-0 first:pt-0">
      <div className="min-w-0 flex-1"><b>{x.title}</b><div className="text-sm text-muted">{x.cls?.name} · {x.teacher.name} · {fmtDate(x.startsAt)} {fmtTime(x.startsAt)}</div></div>
      {cta}
    </li>
  );
  return (
    <>
      <PageHeader eyebrow="Learn together" title="Live classes" sub="Join your teacher's live lessons. Turning your camera on is always optional." />
      {live.length > 0 && (
        <section className="card border-brand" aria-labelledby="h-now">
          <h2 id="h-now" className="text-lg">Live now</h2>
          <ul>{live.map((x) => row(x, <><Chip tone="bad">Live</Chip><Link className="btn-primary" href={`/student/live/${x.id}`}>Join class</Link></>))}</ul>
        </section>
      )}
      <section className="card" aria-labelledby="h-up">
        <h2 id="h-up" className="text-lg">Coming up</h2>
        {upcoming.length === 0 ? <Empty title="No live classes scheduled" body="When a teacher schedules one, it appears here." />
          : <ul>{upcoming.map((x) => row(x, <Link className="btn btn-sm" href={`/student/live/${x.id}`}>Open</Link>))}</ul>}
      </section>
      {past.length > 0 && (
        <section className="card" aria-labelledby="h-past">
          <h2 id="h-past" className="text-lg">Earlier</h2>
          <ul>{past.map((x) => row(x, <><Chip tone={x.attendance.length ? "good" : "plain"}>{x.attendance.length ? "Attended" : "Missed"}</Chip><Link className="btn btn-sm" href={`/student/live/${x.id}`}>Summary</Link></>))}</ul>
        </section>
      )}
    </>
  );
}
