import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { platformTotals } from "@/lib/data-platform";
import { aiAvailable } from "@/lib/ai";
import { Chip, PageHeader } from "@/components/ui";

export const metadata = { title: "Platform" };

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="tnum font-display text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export default async function PlatformHome() {
  await requireRole("SUPER_ADMIN");
  const t = await platformTotals();
  return (
    <>
      <PageHeader eyebrow="Platform administration" title="Educop platform" sub="Every school is a separate tenant. Platform admins see totals only, not student records."
        actions={<Link className="btn-primary" href="/platform/schools/new">Add school</Link>} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Organisations" value={t.orgs} />
        <Kpi label="Schools" value={t.schools} sub={`${t.activeSchools} active`} />
        <Kpi label="Active users (7 days)" value={t.active7} />
        <Kpi label="AI requests (7 days)" value={t.aiRequests7} sub={`${t.aiDrafts7} teacher drafts · ${t.aiFlagged7} flagged`} />
        <Kpi label="Open moderation" value={<Link className="hover:underline" href="/platform/moderation">{t.openModeration}</Link>} />
      </div>

      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between gap-2"><h2 className="text-lg">Totals by school</h2><Link className="btn btn-sm" href="/platform/schools">Manage schools</Link></div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-3">School</th><th className="py-2 pr-3">Organisation</th><th className="py-2 pr-3">Plan</th><th className="py-2 pr-3">Students</th><th className="py-2 pr-3">Teachers</th><th className="py-2 pr-3">Parents</th><th className="py-2 pr-3">Active 7d</th><th className="py-2 pr-3">AI requests 7d</th><th className="py-2 pr-3">Open flags</th><th className="py-2">Status</th></tr></thead>
          <tbody>{t.bySchool.map((s) => (
            <tr key={s.id} className="border-b border-line last:border-0">
              <td className="py-2.5 pr-3 font-bold">{s.name}</td><td className="py-2.5 pr-3">{s.org}</td><td className="py-2.5 pr-3">{s.plan}</td>
              <td className="tnum py-2.5 pr-3">{s.students} <span className="text-xs text-muted">/ {s.seatLimit}</span></td><td className="tnum py-2.5 pr-3">{s.teachers}</td><td className="tnum py-2.5 pr-3">{s.parents}</td>
              <td className="tnum py-2.5 pr-3">{s.active7}</td><td className="tnum py-2.5 pr-3">{s.aiRequests7}</td><td className="tnum py-2.5 pr-3">{s.openModeration}</td>
              <td className="py-2.5"><Chip tone={s.active ? "good" : "warn"}>{s.active ? "Active" : "Suspended"}</Chip></td>
            </tr>
          ))}</tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="text-lg">System</h2>
        <ul className="flex flex-col gap-2 text-sm">
          <li className="flex justify-between gap-2"><span>Database</span><Chip tone="good">Operational</Chip></li>
          <li className="flex justify-between gap-2"><span>AI model API</span><Chip tone={aiAvailable() ? "good" : "warn"}>{aiAvailable() ? "Connected" : "Not configured (template fallbacks)"}</Chip></li>
          <li className="flex justify-between gap-2"><span>Email delivery</span><Chip tone="warn">Not configured</Chip></li>
        </ul>
      </section>
    </>
  );
}
