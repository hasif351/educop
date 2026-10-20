import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { RosterImport } from "./RosterImport";

export const metadata = { title: "Import people" };

export default async function ImportPage() {
  await requireRole("SCHOOL_ADMIN");
  return (
    <>
      <PageHeader eyebrow="People" title="Import a roster" sub="Every row is checked first. Nothing is created until you confirm the import." actions={<Link className="btn" href="/admin/users">Back to people</Link>} />
      <RosterImport />
    </>
  );
}
