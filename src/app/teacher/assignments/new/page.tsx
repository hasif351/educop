import { requireRole } from "@/lib/auth";
import { dayBounds } from "@/lib/data";
import { toLocalInput } from "@/lib/datetime";
import { builderClasses } from "@/lib/teacher-forms";
import { Empty, PageHeader } from "@/components/ui";
import { AssignmentBuilder } from "../AssignmentBuilder";

export const metadata = { title: "New assignment" };

export default async function NewAssignment() {
  const s = await requireRole("TEACHER");
  const classes = await builderClasses(s);
  if (!classes.length) return <Empty title="No classes yet" body="Ask your school admin to assign you a class." />;
  const due = new Date(dayBounds(3).start.getTime() + 15 * 3600_000);
  return (
    <>
      <PageHeader eyebrow="Assignments" title="New assignment" sub="Multiple-choice questions are marked automatically. You mark short answers." />
      <AssignmentBuilder assignmentId={null} classes={classes} defaults={{
        classId: classes[0].id, lessonId: "", title: "", instructions: "", dueAt: toLocalInput(due),
        latePolicy: "penalty", latePenaltyPerDay: 10, maxLateDays: 3,
        questions: [{ type: "MCQ", prompt: "", options: ["", ""], answerIndex: 0, points: 1 }],
      }} />
    </>
  );
}
