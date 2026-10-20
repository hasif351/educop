// Pure grading rules, kept free of database access so they are easy to test.

export type GradableQuestion = {
  id: string;
  type: "MCQ" | "SHORT";
  answerIndex: number | null;
  points: number;
};
export type GivenAnswer = { questionId: string; choiceIndex?: number | null; teacherScore?: number | null };

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysLate(dueAt: Date, submittedAt: Date): number {
  const diff = submittedAt.getTime() - dueAt.getTime();
  return diff <= 0 ? 0 : Math.ceil(diff / DAY_MS);
}

export type LatePolicy = { latePenaltyPerDay: number | null; maxLateDays: number };

/** Whether a submission is still accepted, and why not if it isn't. */
export function lateCheck(policy: LatePolicy, late: number): { accepted: boolean; reason?: string } {
  if (late === 0) return { accepted: true };
  if (policy.latePenaltyPerDay === null) return { accepted: false, reason: "This assignment does not accept late work." };
  if (late > policy.maxLateDays) return { accepted: false, reason: `Late work is accepted for up to ${policy.maxLateDays} days.` };
  return { accepted: true };
}

export function autoScore(q: GradableQuestion, choiceIndex: number | null | undefined): number | null {
  if (q.type !== "MCQ") return null; // needs a teacher
  return choiceIndex != null && choiceIndex === q.answerIndex ? q.points : 0;
}

export function applyLatePenalty(raw: number, policy: LatePolicy, late: number): number {
  if (late === 0 || policy.latePenaltyPerDay === null) return raw;
  const factor = Math.max(0, 1 - (policy.latePenaltyPerDay * late) / 100);
  return Math.round(raw * factor * 100) / 100;
}

/**
 * Totals a submission. Returns fullyGraded=false while any short answer
 * still waits for a teacher score.
 */
export function scoreSubmission(questions: GradableQuestion[], answers: GivenAnswer[]) {
  const byQ = new Map(answers.map((a) => [a.questionId, a]));
  let raw = 0;
  let max = 0;
  let fullyGraded = true;
  for (const q of questions) {
    max += q.points;
    const a = byQ.get(q.id);
    if (q.type === "MCQ") {
      raw += autoScore(q, a?.choiceIndex) ?? 0;
    } else if (a?.teacherScore != null) {
      raw += Math.min(Math.max(a.teacherScore, 0), q.points);
    } else {
      fullyGraded = false;
    }
  }
  return { raw, max, fullyGraded };
}

export function percent(score: number | null | undefined, max: number | null | undefined) {
  if (score == null || !max) return null;
  return Math.round((score / max) * 100);
}
