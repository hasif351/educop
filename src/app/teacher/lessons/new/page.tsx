import { requireRole } from "@/lib/auth";
import { teacherClasses, dayBounds } from "@/lib/data";
import { toLocalInput } from "@/lib/datetime";
import { Empty, PageHeader } from "@/components/ui";
import { LessonForm } from "../LessonForm";

export const metadata = { title: "New lesson" };

export default async function NewLesson() {
  const s = await requireRole("TEACHER");
  const classes = await teacherClasses(s);
  if (!classes.length) return <Empty title="No classes yet" body="Ask your school admin to assign you a class." />;
  const tomorrow9 = new Date(dayBounds(1).start.getTime() + 9 * 3600_000);
  return (
    <>
      <PageHeader eyebrow="Lessons" title="New lesson" sub="Every lesson follows the same 8-part structure so students know what to expect." />
      <LessonForm lessonId={null} classes={classes} defaults={{
        classId: classes[0].id, title: "", outcomeCode: "", scheduledFor: toLocalInput(tomorrow9), durationMin: 30, objectives: "",
        introduction: "", explanation: "", activity: "", knowledgeCheck: [], worksheet: "", nextActivity: "",
      }} />
    </>
  );
}
