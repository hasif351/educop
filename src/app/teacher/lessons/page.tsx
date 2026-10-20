import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { teacherLessons } from "@/lib/data";
import { Chip, Empty, PageHeader, fmtDate, fmtTime } from "@/components/ui";
import { LessonStatusButton } from "./LessonStatusButton";

export const metadata = { title: "Lessons" };

export default async function TeacherLessons({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const s = await requireRole("TEACHER");
  const { saved } = await searchParams;
  const lessons = await teacherLessons(s);
  return (
    <>
      <PageHeader eyebrow="Daily learning" title="My lessons" sub="Draft, schedule and publish lessons for your classes." actions={<Link className="btn-primary" href="/teacher/lessons/new">New lesson</Link>} />
      {saved && <p role="status" className="rounded-lg bg-good-soft px-4 py-2 text-sm font-bold text-good">Lesson saved.</p>}
      {lessons.length === 0 ? <Empty title="No lessons yet" body="Create your first lesson." href="/teacher/lessons/new" cta="New lesson" /> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="p-3">Lesson</th><th className="p-3">Class</th><th className="p-3">When</th><th className="p-3">Status</th><th className="p-3">Completed by</th><th className="p-3"></th></tr></thead>
            <tbody>
              {lessons.map((l) => (
                <tr key={l.id} className="border-b border-line last:border-0">
                  <td className="p-3"><Link className="font-bold hover:underline" href={`/teacher/lessons/${l.id}`}>{l.title}</Link></td>
                  <td className="p-3">{l.class.name}</td>
                  <td className="tnum whitespace-nowrap p-3">{fmtDate(l.scheduledFor)} {fmtTime(l.scheduledFor)}</td>
                  <td className="p-3"><Chip tone={l.status === "PUBLISHED" ? "good" : l.status === "DRAFT" ? "warn" : l.status === "PENDING_APPROVAL" ? "blue" : "plain"}>{STATUS_LABEL[l.status]}</Chip></td>
                  <td className="tnum p-3">{l._count.progress}</td>
                  <td className="p-3 text-right"><LessonStatusButton id={l.id} status={l.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const STATUS_LABEL = { DRAFT: "Draft", PENDING_APPROVAL: "Waiting for approval", PUBLISHED: "Published", ARCHIVED: "Archived" } as const;
