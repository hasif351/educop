import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { lastPractice } from "@/lib/data-student-modules";
import { DOMAIN_INFO, bandFor, isDomain, itemsPerSet, startLevel } from "@/lib/cognitive";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { PracticePlayer } from "./PracticePlayer";

export const metadata = { title: "Reasoning practice" };

export default async function PracticePage({ params }: { params: Promise<{ domain: string }> }) {
  const s = await requireRole("STUDENT");
  const { domain } = await params;
  if (!isDomain(domain)) notFound();
  const [user, last] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { gradeLevel: true } }),
    lastPractice(s, domain),
  ]);
  const info = DOMAIN_INFO[domain];
  return (
    <>
      <PageHeader eyebrow="Reasoning skills practice" title={info.label} sub={info.blurb}
        actions={<Link className="btn btn-sm" href="/student/skills">All skills</Link>} />
      <PracticePlayer domain={domain} label={info.label} count={itemsPerSet(bandFor(user.gradeLevel))} level={startLevel(last)} young={bandFor(user.gradeLevel) === "early"} />
    </>
  );
}
