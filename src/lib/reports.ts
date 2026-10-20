// Pure school-report rules: averages, completion and late work per class and subject.
// Only work that is already due counts towards completion, so a newly set
// assignment doesn't make a class look behind.

export type ReportAssignment = {
  dueAt: Date;
  submissions: { status: "IN_PROGRESS" | "SUBMITTED" | "GRADED"; finalScore: number | null; maxScore: number | null; daysLate: number }[];
};
export type ReportClass = { id: string; name: string; subject: string; teacher: string; students: number; assignments: ReportAssignment[] };

export type ClassReport = {
  id: string; name: string; subject: string; teacher: string; students: number; assignments: number;
  avgPct: number | null; completionPct: number | null; late: number; missing: number; graded: number;
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);

export function classReport(c: ReportClass, now = new Date()): ClassReport {
  let score = 0, max = 0, graded = 0, late = 0, expected = 0, done = 0;
  for (const a of c.assignments) {
    const handedIn = a.submissions.filter((s) => s.status !== "IN_PROGRESS");
    for (const s of handedIn) {
      if (s.daysLate > 0) late++;
      if (s.status === "GRADED" && s.maxScore) { score += s.finalScore ?? 0; max += s.maxScore; graded++; }
    }
    if (a.dueAt <= now) { expected += c.students; done += Math.min(handedIn.length, c.students); }
  }
  return {
    id: c.id, name: c.name, subject: c.subject, teacher: c.teacher, students: c.students, assignments: c.assignments.length,
    avgPct: pct(score, max), completionPct: pct(done, expected), late, missing: expected - done, graded,
  };
}

export type SubjectReport = { subject: string; classes: number; students: number; avgPct: number | null; completionPct: number | null; late: number; missing: number };

/** Rolls class reports up by subject. Averages are weighted by marks and expected work, not by class. */
export function subjectReports(classes: ReportClass[], now = new Date()): SubjectReport[] {
  const by = new Map<string, ReportClass[]>();
  for (const c of classes) by.set(c.subject, [...(by.get(c.subject) ?? []), c]);
  return [...by.entries()].map(([subject, cs]) => {
    let score = 0, max = 0, expected = 0, done = 0, late = 0;
    for (const c of cs) {
      for (const a of c.assignments) {
        const handedIn = a.submissions.filter((s) => s.status !== "IN_PROGRESS");
        for (const s of handedIn) {
          if (s.daysLate > 0) late++;
          if (s.status === "GRADED" && s.maxScore) { score += s.finalScore ?? 0; max += s.maxScore; }
        }
        if (a.dueAt <= now) { expected += c.students; done += Math.min(handedIn.length, c.students); }
      }
    }
    return { subject, classes: cs.length, students: cs.reduce((n, c) => n + c.students, 0), avgPct: pct(score, max), completionPct: pct(done, expected), late, missing: expected - done };
  }).sort((a, b) => a.subject.localeCompare(b.subject));
}

/** Plain reasons a class may need a look. Thresholds are deliberately simple and shown to the admin. */
export function attentionReasons(r: ClassReport): string[] {
  const out: string[] = [];
  if (r.avgPct != null && r.avgPct < 60) out.push(`Average score ${r.avgPct}%`);
  if (r.completionPct != null && r.completionPct < 75) out.push(`${r.completionPct}% of due work handed in`);
  if (r.late >= 3) out.push(`${r.late} late submissions`);
  if (r.students > 0 && r.assignments === 0) out.push("No assignments set yet");
  return out;
}
