import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { NewSchoolForm } from "./NewSchoolForm";

export const metadata = { title: "Add a school" };

export default async function NewSchool() {
  await requireRole("SUPER_ADMIN");
  const orgs = await db.organization.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader eyebrow="Schools" title="Add a school" sub="Creates the tenant and its first school admin." actions={<Link className="btn" href="/platform/schools">Cancel</Link>} />
      <NewSchoolForm orgs={orgs} />
    </>
  );
}
