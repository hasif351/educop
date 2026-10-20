import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { studentRecordings } from "@/lib/data-recordings";
import { RECORDING_POINTS, fmtClock } from "@/lib/recordings";
import { Bar, Chip, Empty, PageHeader, fmtDate } from "@/components/ui";

export const metadata = { title: "Recorded classes" };

export default async function StudentRecordings() {
  const s = await requireRole("STUDENT");
  const recs = await studentRecordings(s);
  return (
    <>
      <PageHeader eyebrow="Learn anytime" title="Recorded classes" sub={`Watch class videos at your own pace. Answer the questions and watch to the end to earn ${RECORDING_POINTS} points.`} />
      <section className="card" aria-labelledby="h-recs">
        <h2 id="h-recs" className="text-lg">Your class videos</h2>
        {recs.length === 0 ? <Empty title="No recorded classes yet" body="When a teacher shares a class video, it appears here." /> : (
          <ul className="flex flex-col">
            {recs.map((r) => {
              const v = r.views[0];
              const pct = v?.watchedPct ?? 0;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-0 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <Link className="font-bold hover:underline" href={`/student/recordings/${r.id}`}>{r.title}</Link>
                    <div className="text-sm text-muted">{r.class.name} · {r.teacher.name}{r.durationSec ? ` · ${fmtClock(r.durationSec)}` : ""}{r.publishedAt ? ` · ${fmtDate(r.publishedAt)}` : ""}</div>
                  </div>
                  <div className="flex w-28 items-center gap-2"><Bar value={pct} tone="teal" /><span className="tnum text-xs">{pct}%</span></div>
                  {v?.completedAt ? <Chip tone="good">Completed</Chip> : pct > 0 ? <Chip tone="blue">In progress</Chip> : <Chip>New</Chip>}
                  <Link className="btn btn-sm" href={`/student/recordings/${r.id}`}>{pct > 0 && !v?.completedAt ? "Keep watching" : "Watch"}</Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
