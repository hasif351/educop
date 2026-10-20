import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { teacherSubmission } from "@/lib/data";
import { fmtDate, fmtTime, Chip, PageHeader } from "@/components/ui";
import { GradeForm } from "./GradeForm";

export default async function MarkSubmission({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const s = await requireRole("TEACHER");
  const { id, sid } = await params;
  const sub = await teacherSubmission(s, id, sid);
  const byQ = new Map(sub.answers.map((x) => [x.questionId, x]));
  return (
    <>
      <PageHeader
        eyebrow={<Link href={`/teacher/assignments/${id}`} className="hover:underline">{sub.assignment.title}</Link>}
        title={sub.student.name}
        sub={sub.submittedAt ? `Submitted ${fmtDate(sub.submittedAt)} at ${fmtTime(sub.submittedAt)}${sub.daysLate ? ` · ${sub.daysLate} day(s) late` : ""}` : undefined}
        actions={sub.status === "GRADED" ? <Chip tone="good">Marked: {sub.finalScore}/{sub.maxScore}</Chip> : <Chip tone="warn">Needs marking</Chip>}
      />
      <GradeForm
        assignmentId={id}
        submissionId={sid}
        feedback={sub.feedback ?? ""}
        items={sub.assignment.questions.map((q) => {
          const a = byQ.get(q.id);
          return { id: q.id, type: q.type, prompt: q.prompt, points: q.points, options: q.options, answerIndex: q.answerIndex, choiceIndex: a?.choiceIndex ?? null, text: a?.text ?? "", autoScore: a?.autoScore ?? null, teacherScore: a?.teacherScore ?? null };
        })}
      />
    </>
  );
}
