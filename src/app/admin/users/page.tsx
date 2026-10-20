import Link from "next/link";
import type { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { PAGE_SIZE, adminUsers, parentLinks, seatUsage } from "@/lib/data-admin";
import { gradeLabel } from "@/lib/roster";
import { ROLE_LABEL } from "@/lib/roles";
import { Chip, Empty, PageHeader, fmtDate } from "@/components/ui";
import { ActionButton } from "../_ui/ActionButton";
import { ActionForm } from "../_ui/ActionForm";
import { linkParent, removeLink, setUserActive, verifyLink } from "../actions";
import { AddUserForm } from "./AddUserForm";

export const metadata = { title: "People" };

const ROLES: Role[] = ["STUDENT", "TEACHER", "PARENT", "SCHOOL_ADMIN"];

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }> }) {
  const s = await requireRole("SCHOOL_ADMIN");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const role = ROLES.includes(sp.role as Role) ? (sp.role as Role) : undefined;
  const status = sp.status === "active" || sp.status === "inactive" ? sp.status : undefined;
  const page = Math.max(1, Math.min(1000, Number(sp.page) || 1));
  const [{ users, total }, links, seats] = await Promise.all([adminUsers(s, { q, role, status, page }), parentLinks(s), seatUsage(s)]);
  const pending = links.filter((l) => !l.verified);
  const pages = Math.ceil(total / PAGE_SIZE);
  const qs = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), ...(role ? { role } : {}), ...(status ? { status } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader eyebrow="School administration" title="People" sub={`${seats.students} of ${seats.seatLimit} student seats used.`}
        actions={<><Link className="btn" href="/admin/users/import">Import CSV</Link><a className="btn-primary" href="#add">Add user</a></>} />

      <form className="card flex-row flex-wrap items-end gap-3" role="search">
        <label className="label min-w-[12rem] flex-1">Search<input className="input" name="q" defaultValue={q} placeholder="Name or email" /></label>
        <label className="label">Role
          <select className="input" name="role" defaultValue={role ?? ""}>
            <option value="">Everyone</option>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}s</option>)}
          </select>
        </label>
        <label className="label">Status
          <select className="input" name="status" defaultValue={status ?? ""}><option value="">Any</option><option value="active">Active</option><option value="inactive">Deactivated</option></select>
        </label>
        <button className="btn">Filter</button>
      </form>

      <section className="card overflow-x-auto p-0">
        {users.length === 0 ? <div className="p-5"><Empty title="No one matches" body="Try a different name, email or role." /></div> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="p-3">Name</th><th className="p-3">Role</th><th className="p-3">Grade / classes</th><th className="p-3">Parent links</th><th className="p-3">Last sign-in</th><th className="p-3">Status</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{users.map((u) => {
              const links = u.role === "STUDENT" ? u.parentLinks : u.role === "PARENT" ? u.childrenLinks : [];
              const verified = links.filter((l) => l.verified).length;
              return (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="p-3"><b>{u.name}</b><div className="text-xs text-muted">{u.email}</div></td>
                  <td className="p-3">{ROLE_LABEL[u.role]}</td>
                  <td className="p-3">{u.role === "STUDENT" ? <>{gradeLabel(u.gradeLevel)}<div className="text-xs text-muted">{u.enrollments.map((e) => e.class.name).join(", ")}</div></> : u.role === "PARENT" ? <span className="text-xs text-muted">{u.childrenLinks.map((l) => l.student.name).join(", ")}</span> : ""}</td>
                  <td className="p-3">{links.length === 0 ? <span className="text-muted">–</span> : verified < links.length ? <Chip tone="warn">Pending verification</Chip> : <Chip tone="good">Verified ({verified})</Chip>}</td>
                  <td className="tnum p-3 text-muted">{u.lastLoginAt ? fmtDate(u.lastLoginAt, { day: "numeric", month: "short" }) : "Never"}</td>
                  <td className="p-3"><Chip tone={u.active ? "good" : "plain"}>{u.active ? "Active" : "Deactivated"}</Chip></td>
                  <td className="p-3 text-right">{u.id !== s.userId && (u.active
                    ? <ActionButton action={setUserActive.bind(null, u.id, false)} confirm={`Deactivate ${u.name}? They won't be able to sign in.`} label={`Deactivate ${u.name}`}>Deactivate</ActionButton>
                    : <ActionButton action={setUserActive.bind(null, u.id, true)} label={`Reactivate ${u.name}`}>Reactivate</ActionButton>)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </section>
      {pages > 1 && (
        <nav className="flex items-center gap-2 text-sm" aria-label="Pages">
          {page > 1 && <Link className="btn btn-sm" href={qs(page - 1)}>Previous</Link>}
          <span className="text-muted">Page {page} of {pages} · {total} people</span>
          {page < pages && <Link className="btn btn-sm" href={qs(page + 1)}>Next</Link>}
        </nav>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section id="add" className="card scroll-mt-24">
          <h2 className="text-lg">Add a user</h2>
          <p className="text-sm text-muted">They get a temporary password, shown once below. Ask them to change it after signing in.</p>
          <AddUserForm seatsLeft={seats.seatsLeft} />
        </section>

        <section id="links" className="card scroll-mt-24">
          <h2 className="text-lg">Parent links</h2>
          {pending.length > 0 ? (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {pending.map((l) => (
                <li key={`${l.parentId}:${l.studentId}`} className="flex flex-wrap items-center gap-2 py-2.5 first:pt-0">
                  <div className="min-w-0 flex-1"><b>{l.parent.name}</b> <span className="text-muted">({l.parent.email})</span> → <b>{l.student.name}</b> <span className="text-muted">{gradeLabel(l.student.gradeLevel)}</span><div className="text-xs text-muted">Requested {fmtDate(l.createdAt)}</div></div>
                  <ActionButton className="btn-primary btn-sm" action={verifyLink.bind(null, l.parentId, l.studentId)} label={`Verify ${l.parent.name} as parent of ${l.student.name}`}>Verify</ActionButton>
                  <ActionButton action={removeLink.bind(null, l.parentId, l.studentId)} confirm="Remove this link?" label={`Remove link ${l.parent.name} to ${l.student.name}`}>Remove</ActionButton>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No links waiting for verification.</p>}
          <p className="text-xs text-muted">Check identity against school records before verifying. Parents see a child&apos;s work only once the link is verified.</p>
          <h3 className="mt-2 text-sm">Link a parent to a student</h3>
          <ActionForm action={linkParent} submit="Link and verify">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="label">Parent email<input className="input" name="parentEmail" type="email" required /></label>
              <label className="label">Student email<input className="input" name="studentEmail" type="email" required /></label>
            </div>
          </ActionForm>
          <details className="text-sm">
            <summary className="cursor-pointer font-bold">Verified links ({links.length - pending.length})</summary>
            <ul className="mt-2 flex flex-col gap-1.5">{links.filter((l) => l.verified).map((l) => (
              <li key={`${l.parentId}:${l.studentId}`} className="flex flex-wrap items-center gap-2"><span className="flex-1">{l.parent.name} → {l.student.name}</span>
                <ActionButton action={removeLink.bind(null, l.parentId, l.studentId)} confirm="Remove this link? The parent will no longer see this child." label={`Remove link ${l.parent.name} to ${l.student.name}`}>Remove</ActionButton></li>
            ))}</ul>
          </details>
        </section>
      </div>
    </>
  );
}
