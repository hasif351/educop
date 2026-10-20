import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { AI_TOOLS, SOURCE_LABEL, draftTitle, gradeLabel, type AiTool, type StoredDraft } from "@/lib/ai-teacher";
import { Chip, PageHeader, fmtDate } from "@/components/ui";
import { DraftEditor } from "./DraftEditor";

export const metadata = { title: "AI draft" };

export default async function AiDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("TEACHER");
  const { id } = await params;
  const d = await db.aiDraft.findFirst({ where: { id, schoolId: s.schoolId, teacherId: s.userId } });
  if (!d) notFound();
  const out = d.output as unknown as StoredDraft;
  const tool = d.tool as AiTool;
  const cls = await db.class.findFirst({ where: { id: out.input.classId, schoolId: s.schoolId, teacherId: s.userId }, select: { name: true } });
  const created = out.createdId ? (tool === "lesson" ? `/teacher/lessons/${out.createdId}` : tool === "quiz" ? `/teacher/assignments/${out.createdId}` : null) : null;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/teacher/ai" className="hover:underline">AI assistant › {AI_TOOLS[tool]?.label ?? "Draft"}</Link>}
        title={draftTitle(tool, out.content, out.input.topic)}
        sub={[cls?.name, gradeLabel(out.input.grade), out.input.outcomeCode, `Created ${fmtDate(d.createdAt)}`].filter(Boolean).join(" · ")}
        actions={<>
          <Chip tone={out.source === "ai" ? "blue" : "warn"}>{SOURCE_LABEL[out.source] ?? SOURCE_LABEL.template}</Chip>
          {d.status === "ACCEPTED" ? <Chip tone="good">Used</Chip> : d.status === "DISCARDED" ? <Chip>Discarded</Chip> : <Chip>Draft</Chip>}
        </>}
      />
      {out.source === "template"
        ? <p className="rounded-lg bg-warn-soft px-4 py-2 text-sm text-warn">This is a template built from your inputs, not AI-written content. Replace the placeholders with your own material.</p>
        : <p className="rounded-lg bg-brand-soft px-4 py-2 text-sm text-brand">AI draft - review before use. Check facts, answers and tone; you are the author once you use it.</p>}
      {created && <p role="status" className="rounded-lg bg-good-soft px-4 py-2 text-sm font-bold text-good">Already used. <Link className="underline" href={created}>Open what you created</Link>.</p>}
      <DraftEditor id={d.id} tool={tool} content={out.content as never} locked={d.status !== "DRAFT"} />
    </>
  );
}
