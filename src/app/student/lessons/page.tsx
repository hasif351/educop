import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { studentLessons, dayBounds } from "@/lib/data";
import { Bar, Chip, Empty, PageHeader, fmtDate, fmtTime } from "@/components/ui";

export const metadata = { title: "Lessons" };

export default async function LessonsPage() {
  const s = await requireRole("STUDENT");
  const lessons = await studentLessons(s);
  const { start, end } = dayBounds();
  const groups = [
    { label: "Coming up", items: lessons.filter((l) => l.scheduledFor >= end).reverse() },
    { label: "Today", items: lessons.filter((l) => l.scheduledFor >= start && l.scheduledFor < end).reverse() },
    { label: "Earlier", items: lessons.filter((l) => l.scheduledFor < start) },
  ];
  return (
    <>
      <PageHeader eyebrow="Daily learning" title="Lessons" sub="This week and last week, from all your classes." />
      {lessons.length === 0 && <Empty title="No lessons yet" body="Your teachers haven't published lessons for these dates." />}
      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.label} className="card">
          <h2 className="text-lg">{g.label}</h2>
          <ul className="flex flex-col divide-y divide-line">
            {g.items.map((l) => {
              const p = l.progress[0];
              const pct = Math.round(((p?.completedSteps.length ?? 0) / 8) * 100);
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="tnum w-24 text-xs text-muted">{fmtDate(l.scheduledFor)} {fmtTime(l.scheduledFor)}</span>
                  <Link href={`/student/lessons/${l.id}`} className="min-w-0 flex-1 hover:underline"><b>{l.title}</b><div className="text-xs text-muted">{l.class.subject.name}</div></Link>
                  {p?.completedAt ? <Chip tone="good">Completed</Chip> : <div className="flex w-28 items-center gap-2"><Bar value={pct} tone="teal" /><span className="tnum text-xs">{pct}%</span></div>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
