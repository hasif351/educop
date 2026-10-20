import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { aiAvailable } from "@/lib/ai";
import { teacherClasses } from "@/lib/data";
import { AI_TOOLS, SOURCE_LABEL, TOOL_KEYS, draftTitle, type AiTool, type StoredDraft } from "@/lib/ai-teacher";
import { Chip, Empty, PageHeader, fmtDate } from "@/components/ui";
import { AiToolForm } from "./AiToolForm";

export const metadata = { title: "AI assistant" };

export default async function TeacherAI({ searchParams }: { searchParams: Promise<{ tool?: string; submission?: string }> }) {
  const s = await requireRole("TEACHER");
  const sp = await searchParams;
  const tool: AiTool = TOOL_KEYS.includes(sp.tool as AiTool) ? (sp.tool as AiTool) : "lesson";
  const [school, classes, submissions, drafts] = await Promise.all([
    db.school.findUniqueOrThrow({ where: { id: s.schoolId }, select: { aiEnabled: true } }),
    teacherClasses(s),
    tool === "feedback" ? db.submission.findMany({
      where: { status: { in: ["SUBMITTED", "GRADED"] }, assignment: { schoolId: s.schoolId, class: { teacherId: s.userId } } },
      select: { id: true, status: true, student: { select: { name: true } }, assignment: { select: { title: true } } },
      orderBy: { submittedAt: "desc" }, take: 40,
    }) : [],
    db.aiDraft.findMany({ where: { schoolId: s.schoolId, teacherId: s.userId, status: { not: "DISCARDED" } }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const live = school.aiEnabled && aiAvailable();

  return (
    <>
      <PageHeader eyebrow="AI teaching assistant" title="Plan and prepare faster" sub="Pick a task and fill in a few details. You get a draft to edit; nothing reaches students or families until you use it."
        actions={live ? <Chip tone="blue">AI connected</Chip> : <Chip tone="warn">{school.aiEnabled ? "Template mode: AI not connected" : "AI turned off by your school"}</Chip>} />
      {!school.aiEnabled && <p role="status" className="rounded-lg bg-warn-soft px-4 py-2 text-sm text-warn">Your school administrator has turned AI features off. The assistant still builds template suggestions from your inputs, with no AI involved.</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section className="card self-start" aria-labelledby="tasks-h">
          <h2 id="tasks-h" className="text-lg">Tasks</h2>
          <nav aria-label="Assistant tasks" className="flex flex-col gap-2">
            {TOOL_KEYS.map((k) => (
              <Link key={k} href={`/teacher/ai?tool=${k}`} aria-current={k === tool ? "page" : undefined}
                className={`rounded-lg border p-3 text-sm ${k === tool ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2"}`}>
                <b className="block">{AI_TOOLS[k].label}</b><span className="text-xs text-muted">{AI_TOOLS[k].blurb}</span>
              </Link>
            ))}
          </nav>
          <p className="rounded-lg bg-surface-2 p-3 text-xs text-muted">Drafts never invent curriculum requirements, results or references. Only a student&apos;s first name is used in feedback prompts.</p>
        </section>

        <section className="card" aria-labelledby="form-h">
          <h2 id="form-h" className="text-lg">{AI_TOOLS[tool].label}</h2>
          <p className="text-sm text-muted">{AI_TOOLS[tool].blurb}</p>
          {classes.length === 0 ? <Empty title="No classes yet" body="Ask your school admin to add you to a class." /> : (
            <AiToolForm key={tool} tool={tool} preselect={sp.submission ?? ""}
              classes={classes.map((c) => ({ id: c.id, name: c.name, gradeLevel: c.gradeLevel }))}
              submissions={submissions.map((x) => ({ id: x.id, label: `${x.student.name} · ${x.assignment.title}${x.status === "SUBMITTED" ? " (needs marking)" : ""}` }))} />
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="drafts-h">
        <h2 id="drafts-h" className="text-lg">Your drafts</h2>
        {drafts.length === 0 ? <Empty title="No drafts yet" body="Generate one above. Drafts stay here until you use or discard them." /> : (
          <ul className="flex flex-col divide-y divide-line">
            {drafts.map((d) => {
              const out = d.output as unknown as StoredDraft;
              const t = d.tool as AiTool;
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 py-3 text-sm first:pt-0 last:pb-0">
                  <Link className="min-w-0 flex-1 hover:underline" href={`/teacher/ai/${d.id}`}>
                    <b>{draftTitle(t, out.content, out.input?.topic ?? "")}</b>
                    <div className="text-xs text-muted">{fmtDate(d.createdAt)}{out.input?.outcomeCode ? ` · ${out.input.outcomeCode}` : ""}</div>
                  </Link>
                  <Chip tone={out.source === "ai" ? "blue" : "warn"}>{SOURCE_LABEL[out.source] ?? SOURCE_LABEL.template}</Chip>
                  {d.status === "ACCEPTED" ? <Chip tone="good">Used</Chip> : <Chip>Draft</Chip>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
