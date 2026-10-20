import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { teacherSubmission } from "@/lib/data";
import { db } from "@/lib/db";
import { draftText, type StoredDraft } from "@/lib/ai-teacher";
import { fmtDate, fmtTime, Chip, PageHeader } from "@/components/ui";
import { GradeForm } from "./GradeForm";

export default async function MarkSubmission({ params, searchParams }: { params: Promise<{ id: string; sid: string }>; searchParams: Promise<{ aiDraft?: string }> }) {
  const s = await requireRole("TEACHER");
  const { id, sid } = await params;
  const { aiDraft } = await searchParams;
  const sub = await teacherSubmission(s, id, sid);
  // Feedback drafted with the AI assistant for this submission ("Use in marking").
  const draft = aiDraft ? await db.aiDraft.findFirst({ where: { id: aiDraft, schoolId: s.schoolId, teacherId: s.userId, tool: "feedback" } }) : null;
  const drafted = draft && (draft.output as unknown as StoredDraft).input.submissionId === sub.id ? draftText("feedback", (draft.output as unknown as StoredDraft).content) : null;
  const byQ = new Map(sub.answers.map((x) => [x.questionId, x]));
  return (
    <>
      <PageHeader
        eyebrow={<Link href={`/teacher/assignments/${id}`} className="hover:underline">{sub.assignment.title}</Link>}
        title={sub.student.name}
        sub={sub.submittedAt ? `Submitted ${fmtDate(sub.submittedAt)} at ${fmtTime(sub.submittedAt)}${sub.daysLate ? ` · ${sub.daysLate} day(s) late` : ""}` : undefined}
        actions={<>
          <Link className="btn btn-sm" href={`/teacher/ai?tool=feedback&submission=${sub.id}`}>Draft feedback with AI</Link>
          {sub.status === "GRADED" ? <Chip tone="good">Marked: {sub.finalScore}/{sub.maxScore}</Chip> : <Chip tone="warn">Needs marking</Chip>}
        </>}
      />
      {drafted && <p role="status" className="rounded-lg bg-brand-soft px-4 py-2 text-sm text-brand">Feedback from your AI assistant draft is filled in below. Review it before saving.</p>}
      <GradeForm
        assignmentId={id}
        submissionId={sid}
        feedback={drafted ?? sub.feedback ?? ""}
        items={sub.assignment.questions.map((q) => {
          const a = byQ.get(q.id);
          return { id: q.id, type: q.type, prompt: q.prompt, points: q.points, options: q.options, answerIndex: q.answerIndex, choiceIndex: a?.choiceIndex ?? null, text: a?.text ?? "", autoScore: a?.autoScore ?? null, teacherScore: a?.teacherScore ?? null };
        })}
      />
    </>
  );
}
