import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { AUDIT_PAGE, platformAudit } from "@/lib/data-platform";
import { ROLE_LABEL } from "@/lib/roles";
import { Empty, PageHeader, fmtDate, fmtTime } from "@/components/ui";

export const metadata = { title: "Audit log" };

const day = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00+04:00`) : undefined);

export default async function Audit({ searchParams }: { searchParams: Promise<{ school?: string; action?: string; from?: string; to?: string; page?: string }> }) {
  await requireRole("SUPER_ADMIN");
  const sp = await searchParams;
  const action = (sp.action ?? "").trim().slice(0, 60);
  const school = (sp.school ?? "").slice(0, 40);
  const from = day(sp.from), toDay = day(sp.to);
  const page = Math.max(1, Math.min(1000, Number(sp.page) || 1));
  const { rows, total, schools, actions } = await platformAudit({ schoolId: school || undefined, action: action || undefined, from, to: toDay ? new Date(toDay.getTime() + 86_400_000) : undefined, page });
  const pages = Math.ceil(total / AUDIT_PAGE);
  const qs = (p: number) => `?${new URLSearchParams({ ...(school ? { school } : {}), ...(action ? { action } : {}), ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}), page: String(p) })}`;
  return (
    <>
      <PageHeader eyebrow="Platform administration" title="Audit log" sub="Who changed what, across every school. Students are shown as “A student”." />
      <form className="card flex-row flex-wrap items-end gap-3" role="search">
        <label className="label">School
          <select className="input" name="school" defaultValue={school}>
            <option value="">All schools</option><option value="platform">Platform (no school)</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="label">Action
          <select className="input" name="action" defaultValue={action}>
            <option value="">Any</option>
            {[...new Set(actions.map((a) => a.split(".")[0]))].map((g) => <option key={g} value={`${g}.`}>{g}.*</option>)}
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="label">From<input className="input" type="date" name="from" defaultValue={sp.from} /></label>
        <label className="label">To<input className="input" type="date" name="to" defaultValue={sp.to} /></label>
        <button className="btn">Filter</button>
      </form>
      <section className="card overflow-x-auto p-0">
        {rows.length === 0 ? <div className="p-5"><Empty title="No entries" body="Try widening the filters." /></div> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="p-3">Time</th><th className="p-3">School</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Target</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="tnum whitespace-nowrap p-3 text-muted">{fmtDate(r.createdAt, { day: "numeric", month: "short" })} {fmtTime(r.createdAt)}</td>
                <td className="p-3">{r.school?.name ?? "Platform"}</td>
                <td className="p-3">{r.actorLabel}{r.actor && r.actor.role !== "STUDENT" && <div className="text-xs text-muted">{ROLE_LABEL[r.actor.role]}</div>}</td>
                <td className="p-3 font-mono text-xs">{r.action}</td>
                <td className="max-w-[12rem] truncate p-3 font-mono text-xs text-muted">{r.target ?? ""}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
      {pages > 1 && (
        <nav className="flex items-center gap-2 text-sm" aria-label="Pages">
          {page > 1 && <Link className="btn btn-sm" href={qs(page - 1)}>Previous</Link>}
          <span className="text-muted">Page {page} of {pages} · {total} entries</span>
          {page < pages && <Link className="btn btn-sm" href={qs(page + 1)}>Next</Link>}
        </nav>
      )}
    </>
  );
}
