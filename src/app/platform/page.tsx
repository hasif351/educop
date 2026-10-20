import { requireRole } from "@/lib/auth";
import { platformOverview } from "@/lib/data";
import { Chip, PageHeader } from "@/components/ui";

export const metadata = { title: "Schools" };

export default async function PlatformHome() {
  await requireRole("SUPER_ADMIN");
  const schools = await platformOverview();
  return (
    <>
      <PageHeader eyebrow="Platform administration" title="Schools" sub="Every school is a separate tenant. Platform admins see totals only, not student records." />
      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-3">School</th><th className="py-2 pr-3">Organisation</th><th className="py-2 pr-3">City</th><th className="py-2 pr-3">Curriculum</th><th className="py-2 pr-3">Users</th><th className="py-2 pr-3">Classes</th><th className="py-2 pr-3">Lessons</th><th className="py-2 pr-3">Assignments</th><th className="py-2">Status</th></tr></thead>
          <tbody>{schools.map((s) => (
            <tr key={s.id} className="border-b border-line last:border-0">
              <td className="py-2.5 pr-3 font-bold">{s.name}<div className="text-xs font-normal text-muted">{s.slug}</div></td><td className="py-2.5 pr-3">{s.organization.name}</td><td className="py-2.5 pr-3">{s.city}</td><td className="py-2.5 pr-3">{s.curriculum}</td>
              <td className="tnum py-2.5 pr-3">{s._count.users}</td><td className="tnum py-2.5 pr-3">{s._count.classes}</td><td className="tnum py-2.5 pr-3">{s._count.lessons}</td><td className="tnum py-2.5 pr-3">{s._count.assignments}</td>
              <td className="py-2.5"><Chip tone={s.active ? "good" : "warn"}>{s.active ? "Active" : "Suspended"}</Chip></td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </>
  );
}
