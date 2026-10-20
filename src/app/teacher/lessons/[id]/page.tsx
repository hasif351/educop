import { requireRole } from "@/lib/auth";
import { teacherClasses, teacherLesson } from "@/lib/data";
import { toLocalInput } from "@/lib/datetime";
import { Chip, PageHeader } from "@/components/ui";
import { LessonForm, type LessonDefaults } from "../LessonForm";

export default async function EditLesson({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("TEACHER");
  const { id } = await params;
  const [l, classes] = await Promise.all([teacherLesson(s, id), teacherClasses(s)]);
  return (
    <>
      <PageHeader eyebrow={`Lessons › ${l.class.name}`} title={l.title} actions={<Chip tone={l.status === "PUBLISHED" ? "good" : "warn"}>{l.status === "PUBLISHED" ? "Published" : "Draft"}</Chip>} />
      <LessonForm lessonId={l.id} classes={classes} defaults={{
        classId: l.classId, title: l.title, outcomeCode: l.outcomeCode ?? "", scheduledFor: toLocalInput(l.scheduledFor), durationMin: l.durationMin,
        objectives: l.objectives.join("\n"), introduction: l.introduction, explanation: l.explanation, activity: l.activity,
        knowledgeCheck: (l.knowledgeCheck as LessonDefaults["knowledgeCheck"]).map((q) => ({ ...q, hint: q.hint ?? "", explanation: q.explanation ?? "" })),
        worksheet: l.worksheet, nextActivity: l.nextActivity,
      }} />
    </>
  );
}
