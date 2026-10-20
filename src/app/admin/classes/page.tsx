import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { adminClasses } from "@/lib/data-admin";
import { gradeLabel } from "@/lib/roster";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { ActionButton } from "../_ui/ActionButton";
import { ActionForm } from "../_ui/ActionForm";
import { createClass, createSubject, deleteSubject } from "../actions";

export const metadata = { title: "Classes" };

const GRADES = ["KG1", "KG2", ...Array.from({ length: 12 }, (_, i) => String(i + 1))];

export default async function AdminClasses() {
  const s = await requireRole("SCHOOL_ADMIN");
  const { classes, subjects, teachers, years } = await adminClasses(s);
  const current = years.find((y) => y.isCurrent) ?? years[0];
  return (
    <>
      <PageHeader eyebrow="School administration" title="Grades & classes" sub="Create classes, assign teachers and manage enrolment." />

      <section className="card overflow-x-auto p-0">
        {classes.length === 0 ? <div className="p-5"><Empty title="No classes yet" body="Create the first class below." /></div> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="p-3">Class</th><th className="p-3">Grade</th><th className="p-3">Subject</th><th className="p-3">Teacher</th><th className="p-3">Year</th><th className="p-3">Students</th><th className="p-3"><span className="sr-only">Manage</span></th></tr></thead>
            <tbody>{classes.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="p-3 font-bold">{c.name}</td><td className="p-3">{gradeLabel(c.gradeLevel)}</td><td className="p-3">{c.subject.name}</td>
                <td className="p-3">{c.teacher.name}</td><td className="p-3">{c.academicYear.name}</td><td className="tnum p-3">{c._count.enrollments}</td>
                <td className="p-3 text-right"><Link className="btn btn-sm" href={`/admin/classes/${c.id}`} aria-label={`Manage ${c.name}`}>Manage</Link></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="text-lg">Create a class</h2>
          {years.length === 0 || subjects.length === 0 || teachers.length === 0 ? (
            <Empty title="A few things first" body="A class needs an academic year (School settings), a subject (below) and an active teacher (People)." href={years.length === 0 ? "/admin/school" : teachers.length === 0 ? "/admin/users" : undefined} cta={years.length === 0 ? "School settings" : teachers.length === 0 ? "Add a teacher" : undefined} />
          ) : (
            <ActionForm action={createClass} submit="Create class">
              <label className="label">Class name<input className="input" name="name" required maxLength={80} placeholder="e.g. 5C Science" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="label">Subject<select className="input" name="subjectId" required defaultValue="">{[<option key="" value="" disabled>Choose…</option>, ...subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)]}</select></label>
                <label className="label">Teacher<select className="input" name="teacherId" required defaultValue="">{[<option key="" value="" disabled>Choose…</option>, ...teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)]}</select></label>
                <label className="label">Grade<select className="input" name="grade" required defaultValue="">{[<option key="" value="" disabled>Choose…</option>, ...GRADES.map((g) => <option key={g} value={g}>{/^\d/.test(g) ? `Grade ${g}` : g}</option>)]}</select></label>
                <label className="label">Academic year<select className="input" name="academicYearId" required defaultValue={current?.id}>{years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? " (current)" : ""}</option>)}</select></label>
              </div>
            </ActionForm>
          )}
        </section>

        <section className="card">
          <h2 className="text-lg">Subjects</h2>
          <ul className="flex flex-col divide-y divide-line text-sm">
            {subjects.map((x) => (
              <li key={x.id} className="flex items-center gap-2 py-2 first:pt-0">
                <Chip tone={x.color === "teal" ? "teal" : x.color === "warn" ? "warn" : x.color === "good" ? "good" : "blue"}>{x.code}</Chip>
                <span className="flex-1">{x.name} <span className="text-muted">· {x._count.classes} class{x._count.classes === 1 ? "" : "es"}</span></span>
                {x._count.classes === 0 && <ActionButton action={deleteSubject.bind(null, x.id)} confirm={`Delete ${x.name}?`} label={`Delete ${x.name}`}>Delete</ActionButton>}
              </li>
            ))}
          </ul>
          <h3 className="text-sm">Add a subject</h3>
          <ActionForm action={createSubject} submit="Add subject">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="label sm:col-span-2">Subject name<input className="input" name="name" required maxLength={60} placeholder="e.g. Arabic" /></label>
              <label className="label">Code<input className="input uppercase" name="code" required maxLength={6} placeholder="AR" /></label>
              <label className="label">Colour<select className="input" name="color" defaultValue="blue"><option value="blue">Blue</option><option value="teal">Teal</option><option value="warn">Amber</option><option value="good">Green</option></select></label>
            </div>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
