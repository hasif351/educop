import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { schoolReports } from "@/lib/data-admin";
import { toCsv } from "@/lib/roster";

// School report as CSV. Class-level figures only, for the admin's own school.
export async function GET() {
  const s = await requireRole("SCHOOL_ADMIN");
  const { classes, subjects } = await schoolReports(s);
  const rows: unknown[][] = [
    ["level", "name", "subject", "teacher", "students", "assignments", "average_score_pct", "completion_pct", "late_submissions", "missing"],
    ...subjects.map((r) => ["subject", r.subject, r.subject, "", r.students, "", r.avgPct ?? "", r.completionPct ?? "", r.late, r.missing]),
    ...classes.map((r) => ["class", r.name, r.subject, r.teacher, r.students, r.assignments, r.avgPct ?? "", r.completionPct ?? "", r.late, r.missing]),
  ];
  await audit(s, "report.export", undefined, { rows: rows.length - 1 });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="school-report-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
