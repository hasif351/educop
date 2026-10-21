import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { teacherRecordings } from "@/lib/data-recordings";
import { fmtClock } from "@/lib/recordings";
import { Chip, Empty, PageHeader, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Recorded classes" };

export default async function TeacherRecordings() {
  const s = await requireRole("TEACHER");
  const recs = await teacherRecordings(s);
  return (
    <>
      <PageHeader eyebrow="Teach anytime" title="Recorded classes" sub="Share class videos with captions, chapters and questions, and see how far students watch."
        actions={<div className="flex flex-wrap gap-2"><Link className="btn" href="/teacher/recordings/studio"><Icon name="record" /> Record in studio</Link><Link className="btn-primary" href="/teacher/recordings/new"><Icon name="plus" /> New recording</Link></div>} />
      <section className="card overflow-x-auto" aria-labelledby="h-recs">
        <h2 id="h-recs" className="text-lg">Your recordings</h2>
        {recs.length === 0 ? <Empty title="No recordings yet" body="Record one in the studio with your camera, screen and whiteboard, or upload a class video. After a live class, use “Add the class recording” on its summary." href="/teacher/recordings/new" cta="New recording" /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-2">Recording</th><th className="p-2">Status</th><th className="p-2">Views</th><th className="p-2">Avg watched</th><th className="p-2">Completed</th></tr></thead>
            <tbody>
              {recs.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-2">
                    <Link className="font-bold hover:underline" href={`/teacher/recordings/${r.id}`}>{r.title}</Link>
                    <div className="text-muted">{r.class.name}{r.durationSec ? ` · ${fmtClock(r.durationSec)}` : ""}{r.publishedAt ? ` · ${fmtDate(r.publishedAt)}` : ""}</div>
                  </td>
                  <td className="p-2">{r.status === "PUBLISHED" ? <Chip tone="good">Published</Chip> : <Chip>Draft</Chip>}</td>
                  <td className="tnum p-2">{r.viewCount}/{r.class._count.enrollments}</td>
                  <td className="tnum p-2">{r.avgPct == null ? "–" : `${r.avgPct}%`}</td>
                  <td className="tnum p-2">{r.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
