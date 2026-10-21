import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { teacherClasses } from "@/lib/data";
import { teacherLiveSessions } from "@/lib/live";
import { toLocalInput } from "@/lib/datetime";
import { Chip, Empty, PageHeader, fmtDate, fmtTime } from "@/components/ui";
import { ScheduleForm } from "@/components/live/ScheduleForm";
import { startLive } from "./actions";
import { PROVIDER_LABEL, type VideoProvider } from "@/lib/live-utils";
import { livekitEnabled } from "@/lib/livekit";

export const metadata = { title: "Virtual classroom" };

export default async function TeacherLive() {
  const s = await requireRole("TEACHER");
  const [classes, sessions] = await Promise.all([teacherClasses(s), teacherLiveSessions(s)]);
  const upcoming = sessions.filter((x) => x.status !== "ENDED");
  const past = sessions.filter((x) => x.status === "ENDED").reverse();
  const nextHour = new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000);

  return (
    <>
      <PageHeader eyebrow="Teach live" title="Virtual classroom" sub="Schedule live lessons for your classes, run them with chat, hands and polls, and see who attended." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card" aria-labelledby="h-upcoming">
          <h2 id="h-upcoming" className="text-lg">Upcoming and live</h2>
          {upcoming.length === 0 ? <Empty title="Nothing scheduled" body="Schedule a live class with the form." /> : (
            <ul className="flex flex-col">
              {upcoming.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-0 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <Link className="font-bold hover:underline" href={`/teacher/live/${x.id}`}>{x.title}</Link>
                    <div className="text-sm text-muted">{x.cls?.name} · {fmtDate(x.startsAt)} {fmtTime(x.startsAt)} · {x.durationMin} min · {PROVIDER_LABEL[x.provider as VideoProvider] ?? x.provider}</div>
                  </div>
                  {x.status === "LIVE" ? <><Chip tone="bad">Live now</Chip><Link className="btn-primary btn-sm" href={`/teacher/live/${x.id}`}>Open class</Link></>
                    : <form action={startLive.bind(null, x.id)}><button className="btn-teal btn-sm">Start class</button></form>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card self-start" aria-labelledby="h-schedule">
          <h2 id="h-schedule" className="text-lg">Schedule a live class</h2>
          {classes.length === 0 ? <p className="text-sm text-muted">You don&apos;t teach any classes yet.</p>
            : <ScheduleForm classes={classes.map((c) => ({ id: c.id, name: c.name }))} defaultStart={toLocalInput(nextHour)} educopEnabled={livekitEnabled()} />}
          <p className="text-xs text-muted">Only students enrolled in the class and signed in to the school account can join.</p>
        </section>
      </div>
      <section className="card overflow-x-auto" aria-labelledby="h-past">
        <h2 id="h-past" className="text-lg">Past classes</h2>
        {past.length === 0 ? <p className="text-sm text-muted">No past live classes yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-2">Class</th><th className="p-2">When</th><th className="p-2">Attended</th><th className="p-2"></th></tr></thead>
            <tbody>
              {past.map((x) => (
                <tr key={x.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-2"><b>{x.title}</b><div className="text-muted">{x.cls?.name}</div></td>
                  <td className="tnum whitespace-nowrap p-2">{fmtDate(x.startsAt)} {fmtTime(x.startsAt)}</td>
                  <td className="tnum p-2">{x._count.attendance}/{x.cls?._count.enrollments ?? 0}</td>
                  <td className="p-2 text-right"><Link className="btn btn-sm" href={`/teacher/live/${x.id}`}>Attendance report</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
