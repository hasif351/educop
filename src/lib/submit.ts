import "server-only";
import { db } from "./db";
import { applyLatePenalty, scoreSubmission } from "./grading";
import { recommendFromResult } from "./recommend";

/**
 * Re-scores a submission from its stored answers. When every answer is marked,
 * it becomes GRADED and the recommendation engine runs once for it.
 */
export async function finalizeScore(submissionId: string) {
  const sub = await db.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: { answers: true, assignment: { include: { questions: true, lesson: { select: { id: true, title: true } } } } },
  });
  const a = sub.assignment;
  const { raw, max, fullyGraded } = scoreSubmission(
    a.questions.map((q) => ({ id: q.id, type: q.type, answerIndex: q.answerIndex, points: q.points })),
    sub.answers.map((x) => ({ questionId: x.questionId, choiceIndex: x.choiceIndex, teacherScore: x.teacherScore })),
  );
  const final = applyLatePenalty(raw, a, sub.daysLate);
  const wasGraded = sub.status === "GRADED";
  await db.submission.update({
    where: { id: sub.id },
    data: {
      rawScore: raw, maxScore: max,
      finalScore: fullyGraded ? final : null,
      status: fullyGraded ? "GRADED" : "SUBMITTED",
      gradedAt: fullyGraded ? new Date() : null,
    },
  });
  if (fullyGraded && !wasGraded) {
    const rec = recommendFromResult({ assignmentTitle: a.title, lesson: a.lesson, finalScore: final, maxScore: max });
    if (rec) await db.recommendation.create({ data: { schoolId: a.schoolId, studentId: sub.studentId, ...rec } });
  }
  return { raw, max, final, fullyGraded };
}
