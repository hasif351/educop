import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { teacherAssignment } from "@/lib/data";
import { toLocalInput } from "@/lib/datetime";
import { builderClasses } from "@/lib/teacher-forms";
import { PageHeader } from "@/components/ui";
import { AssignmentBuilder } from "../../AssignmentBuilder";

export default async function EditAssignment({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("TEACHER");
  const { id } = await params;
  const [a, classes] = await Promise.all([teacherAssignment(s, id), builderClasses(s)]);
  if (a.status !== "DRAFT") redirect(`/teacher/assignments/${a.id}`);
  return (
    <>
      <PageHeader eyebrow="Assignments" title={`Edit: ${a.title}`} />
      <AssignmentBuilder assignmentId={a.id} classes={classes} defaults={{
        classId: a.classId, lessonId: a.lessonId ?? "", title: a.title, instructions: a.instructions, dueAt: toLocalInput(a.dueAt),
        latePolicy: a.latePenaltyPerDay === null ? "none" : a.latePenaltyPerDay === 0 ? "nopenalty" : "penalty",
        latePenaltyPerDay: a.latePenaltyPerDay || 10, maxLateDays: a.maxLateDays,
        questions: a.questions.map((q) => ({ type: q.type, prompt: q.prompt, options: q.options, answerIndex: q.answerIndex ?? 0, points: q.points })),
      }} />
    </>
  );
}
