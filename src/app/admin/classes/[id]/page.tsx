import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { adminClass, adminClasses } from "@/lib/data-admin";
import { gradeLabel } from "@/lib/roster";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { ActionButton } from "../../_ui/ActionButton";
import { ActionForm } from "../../_ui/ActionForm";
import { enrolStudents, unenrolStudent, updateClassTeacher } from "../../actions";

export const metadata = { title: "Manage class" };

export default async function AdminClass({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("SCHOOL_ADMIN");
  const { id } = await params;
  const c = await adminClass(s, id);
  const { teachers } = await adminClasses(s);
  const sameGrade = c.available.filter((x) => x.gradeLevel === c.gradeLevel);
  const others = c.available.filter((x) => x.gradeLevel !== c.gradeLevel);
  return (
    <>
      <PageHeader eyebrow={`Classes › ${c.academicYear.name}`} title={c.name} sub={`${c.subject.name} · ${gradeLabel(c.gradeLevel)} · ${c.teacher.name}`} actions={<Link className="btn" href="/admin/classes">All classes</Link>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="text-lg">Enrolled students <Chip>{c.enrollments.length}</Chip></h2>
          {c.enrollments.length === 0 ? <Empty title="No students yet" body="Enrol students from the list." /> : (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {c.enrollments.map(({ student }) => (
                <li key={student.id} className="flex items-center gap-2 py-2 first:pt-0">
                  <span className="flex-1"><b>{student.name}</b> <span className="text-muted">· {gradeLabel(student.gradeLevel)}{student.active ? "" : " · deactivated"}</span></span>
                  <ActionButton action={unenrolStudent.bind(null, c.id, student.id)} confirm={`Remove ${student.name} from ${c.name}? Their past work is kept.`} label={`Remove ${student.name}`}>Remove</ActionButton>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="flex flex-col gap-6">
          <section className="card">
            <h2 className="text-lg">Enrol students</h2>
            {c.available.length === 0 ? <p className="text-sm text-muted">Every active student is already in this class.</p> : (
              <ActionForm action={enrolStudents.bind(null, c.id)} submit="Enrol selected">
                {[["Same grade", sameGrade], ["Other grades", others]].map(([label, list]) => (list as typeof c.available).length > 0 && (
                  <fieldset key={label as string} className="flex flex-col gap-1.5">
                    <legend className="mb-1 text-sm font-bold">{label as string}</legend>
                    <div className="grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
                      {(list as typeof c.available).map((st) => (
                        <label key={st.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="studentId" value={st.id} />{st.name} <span className="text-xs text-muted">{gradeLabel(st.gradeLevel)}</span></label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </ActionForm>
            )}
          </section>
          <section className="card">
            <h2 className="text-lg">Class teacher</h2>
            <ActionForm action={updateClassTeacher.bind(null, c.id)} submit="Change teacher" reset={false}>
              <label className="label">Teacher<select className="input" name="teacherId" defaultValue={c.teacherId}>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            </ActionForm>
          </section>
        </div>
      </div>
    </>
  );
}
