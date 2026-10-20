// Rule-based recommendation engine for the MVP. Later phases can add an AI step
// between "find the gap" and "explain", but the evidence stays attached either way.

export type RecInput = {
  assignmentTitle: string;
  lesson: { id: string; title: string } | null;
  finalScore: number;
  maxScore: number;
};

export type RecDraft = {
  kind: "REVIEW" | "PRACTICE" | "CHALLENGE";
  title: string;
  evidence: string[];
  lessonId: string | null;
  // Stretch work changes what a student is taught, so a teacher approves it first.
  status: "ACTIVE" | "PENDING_REVIEW";
};

export function recommendFromResult(r: RecInput): RecDraft | null {
  if (r.maxScore <= 0) return null;
  const pct = Math.round((r.finalScore / r.maxScore) * 100);
  const evidence = [`${r.assignmentTitle}: ${r.finalScore}/${r.maxScore} (${pct}%)`];
  const topic = r.lesson?.title ?? r.assignmentTitle;

  if (pct < 60) {
    return {
      kind: "REVIEW",
      title: `Review the lesson: ${topic}`,
      evidence: [...evidence, "Below 60% suggests the key idea needs another look."],
      lessonId: r.lesson?.id ?? null,
      status: "ACTIVE",
    };
  }
  if (pct < 85) {
    return {
      kind: "PRACTICE",
      title: `Extra practice: ${topic}`,
      evidence: [...evidence, "Between 60% and 85%: a little more practice should make this secure."],
      lessonId: r.lesson?.id ?? null,
      status: "ACTIVE",
    };
  }
  if (pct >= 90) {
    return {
      kind: "CHALLENGE",
      title: `Challenge task: ${topic}`,
      evidence: [...evidence, "90% or above: ready for a stretch activity."],
      lessonId: r.lesson?.id ?? null,
      status: "PENDING_REVIEW",
    };
  }
  return null;
}
