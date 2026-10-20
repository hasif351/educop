import { requireRole } from "@/lib/auth";
import { schoolSettings } from "@/lib/data-admin";
import { Chip, PageHeader, fmtDate } from "@/components/ui";
import { ActionButton } from "../_ui/ActionButton";
import { ActionForm } from "../_ui/ActionForm";
import { addAcademicYear, setCurrentYear, updateSchool } from "../actions";

export const metadata = { title: "School settings" };

const CURRICULA = ["British", "American", "IB", "Indian (CBSE)", "UAE Ministry of Education", "French", "Other"];
const TIMEZONES = ["Asia/Dubai", "Asia/Riyadh", "Asia/Qatar", "Asia/Bahrain", "Asia/Kuwait", "Asia/Muscat", "Africa/Cairo", "Europe/London", "Asia/Kolkata", "UTC"];

export default async function SchoolSettings() {
  const s = await requireRole("SCHOOL_ADMIN");
  const school = await schoolSettings(s);
  const curricula = CURRICULA.includes(school.curriculum) ? CURRICULA : [school.curriculum, ...CURRICULA];
  const zones = TIMEZONES.includes(school.timezone) ? TIMEZONES : [school.timezone, ...TIMEZONES];
  const fmt = (d: Date) => fmtDate(d, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return (
    <>
      <PageHeader eyebrow={school.organization.name} title="School settings" sub={`Plan: ${school.plan} · ${school.seatLimit} student seats. Contact Educop to change your plan.`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="text-lg">School profile</h2>
          <ActionForm action={updateSchool} submit="Save settings" reset={false}>
            <label className="label">School name<input className="input" name="name" defaultValue={school.name} required maxLength={120} /></label>
            <label className="label">City<input className="input" name="city" defaultValue={school.city ?? ""} maxLength={80} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="label">Curriculum<select className="input" name="curriculum" defaultValue={school.curriculum}>{curricula.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label className="label">Time zone<select className="input" name="timezone" defaultValue={school.timezone}>{zones.map((z) => <option key={z}>{z}</option>)}</select></label>
            </div>
            <fieldset className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <legend className="px-1 text-sm font-bold">Controls</legend>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="requireLessonApproval" defaultChecked={school.requireLessonApproval} className="mt-1" />
                <span><b>Lessons need approval before students see them</b><br /><span className="text-muted">When a teacher publishes, the lesson waits in Approvals.</span></span></label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="aiEnabled" defaultChecked={school.aiEnabled} className="mt-1" />
                <span><b>AI features are on</b><br /><span className="text-muted">Study buddy for students and the teacher AI assistant. Teachers always review AI drafts.</span></span></label>
            </fieldset>
          </ActionForm>
        </section>
        <section className="card">
          <h2 className="text-lg">Academic years</h2>
          <ul className="flex flex-col divide-y divide-line text-sm">
            {school.academicYears.map((y) => (
              <li key={y.id} className="flex flex-wrap items-center gap-2 py-2 first:pt-0">
                <span className="flex-1"><b>{y.name}</b> <span className="text-muted">· {fmt(y.startsOn)} – {fmt(y.endsOn)} · {y._count.classes} classes</span></span>
                {y.isCurrent ? <Chip tone="good">Current</Chip> : <ActionButton action={setCurrentYear.bind(null, y.id)} label={`Make ${y.name} current`}>Make current</ActionButton>}
              </li>
            ))}
          </ul>
          <h3 className="text-sm">Add a year</h3>
          <ActionForm action={addAcademicYear} submit="Add year">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="label">Name<input className="input" name="name" required maxLength={20} placeholder="2027–28" /></label>
              <label className="label">Starts<input className="input" type="date" name="startsOn" required /></label>
              <label className="label">Ends<input className="input" type="date" name="endsOn" required /></label>
            </div>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
