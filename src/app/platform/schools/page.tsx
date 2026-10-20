import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { platformSchools } from "@/lib/data-platform";
import { Chip, PageHeader, fmtDate } from "@/components/ui";
import { ActionButton } from "@/app/admin/_ui/ActionButton";
import { ActionForm } from "@/app/admin/_ui/ActionForm";
import { setSchoolActive, updatePlan } from "../actions";

export const metadata = { title: "Schools" };

const PLANS = ["Pilot", "Trial", "Standard", "Enterprise"];

export default async function Schools() {
  await requireRole("SUPER_ADMIN");
  const { orgs, schools } = await platformSchools();
  return (
    <>
      <PageHeader eyebrow="Platform administration" title="Schools & tenants" sub={`${orgs.length} organisations · ${schools.length} schools. Suspending a school stops its people signing in; nothing is deleted.`}
        actions={<Link className="btn-primary" href="/platform/schools/new">Add school</Link>} />
      {orgs.map((o) => (
        <section key={o.id} className="flex flex-col gap-3">
          <h2 className="text-lg">{o.name}</h2>
          {schools.filter((s) => s.organizationId === o.id).length === 0 && <p className="text-sm text-muted">No schools yet.</p>}
          {schools.filter((s) => s.organizationId === o.id).map((s) => (
            <article key={s.id} className="card gap-4 md:flex-row md:items-start" aria-label={s.name}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-base">{s.name}</h3><Chip tone={s.active ? "good" : "warn"}>{s.active ? "Active" : "Suspended"}</Chip></div>
                <p className="text-sm text-muted">{s.slug} · {s.city ?? "–"} · {s.curriculum} · since {fmtDate(s.createdAt, { month: "short", year: "numeric" })}</p>
                <p className="tnum text-sm">Seats: <b>{s.students}</b> / {s.seatLimit} students · {s._count.users} accounts · {s._count.classes} classes</p>
                <div className="mt-2">
                  {s.active
                    ? <ActionButton action={setSchoolActive.bind(null, s.id, false)} confirm={`Suspend ${s.name}? Its people won't be able to sign in until you reactivate it.`} label={`Suspend ${s.name}`}>Suspend</ActionButton>
                    : <ActionButton className="btn-primary btn-sm" action={setSchoolActive.bind(null, s.id, true)} label={`Reactivate ${s.name}`}>Reactivate</ActionButton>}
                </div>
              </div>
              <ActionForm action={updatePlan.bind(null, s.id)} submit="Save plan" reset={false} className="flex flex-wrap items-end gap-3">
                <label className="label">Plan<select className="input" name="plan" defaultValue={s.plan} aria-label={`Plan for ${s.name}`}>{(PLANS.includes(s.plan) ? PLANS : [s.plan, ...PLANS]).map((p) => <option key={p}>{p}</option>)}</select></label>
                <label className="label">Seat limit<input className="input w-28" type="number" name="seatLimit" min={1} max={100000} defaultValue={s.seatLimit} aria-label={`Seat limit for ${s.name}`} /></label>
              </ActionForm>
            </article>
          ))}
        </section>
      ))}
    </>
  );
}
