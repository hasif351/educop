import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { studentLesson } from "@/lib/data";
import { Chip, fmtDate } from "@/components/ui";
import { LessonPlayer, type KCItem } from "./LessonPlayer";

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("STUDENT");
  const { id } = await params;
  const l = await studentLesson(s, id);
  const progress = l.progress[0];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow"><Link href="/student/lessons" className="hover:underline">Lessons</Link> › {l.class.subject.name}</div>
          <h1 className="text-2xl">{l.title}</h1>
          <p className="text-muted">{l.class.name} · {l.class.teacher.name} · {fmtDate(l.scheduledFor)} · {l.durationMin} min</p>
        </div>
        {l.outcomeCode && <Chip tone="teal">Outcome {l.outcomeCode}</Chip>}
      </div>
      <LessonPlayer
        lessonId={l.id}
        initialDone={progress?.completedSteps ?? []}
        content={{
          objectives: l.objectives, introduction: l.introduction, explanation: l.explanation, activity: l.activity,
          knowledgeCheck: (l.knowledgeCheck as KCItem[]) ?? [], worksheet: l.worksheet, nextActivity: l.nextActivity,
          assignments: l.assignments,
        }}
      />
    </>
  );
}
