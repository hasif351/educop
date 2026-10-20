import type { PrismaClient } from "@prisma/client";
import { buildPrompt, templateDraft, type PromptContext, type StoredDraft } from "../../src/lib/ai-teacher";

const DAY = 86_400_000;

// Demo data for the teacher modules. Must be idempotent: it also runs against a
// database that was seeded before these modules existed (see seed/modules.ts).
export async function seedTeacher(db: PrismaClient) {
  const sara = await db.user.findUnique({ where: { email: "sara.mitchell@crescentbay.example" } });
  if (!sara?.schoolId) return;
  const cls = await db.class.findFirst({ where: { schoolId: sara.schoolId, teacherId: sara.id, name: "5B Mathematics" } });
  if (!cls) return;
  const ago = (days: number) => new Date(Date.now() - days * DAY);

  // ---------- AI assistant drafts ----------
  if ((await db.aiDraft.count({ where: { teacherId: sara.id } })) === 0) {
    const base = { classId: cls.id, grade: 5, notes: "Mixed ability, 40 minutes", questionCount: 5, submissionId: "" };
    const lessonInput = { ...base, tool: "lesson" as const, topic: "fractions on a number line", outcomeCode: "G5-NUM-FR-05 (sample)" };
    const lessonCtx: PromptContext = { ...lessonInput, className: cls.name, subject: "Mathematics" };
    // A sample of what the connected assistant returns, so the demo shows a real-looking draft.
    const lesson: StoredDraft = {
      input: lessonInput, source: "ai",
      content: {
        title: "Fractions on a number line", durationMin: 40,
        objectives: ["I can split a number line from 0 to 1 into equal parts.", "I can place fractions such as 1/4, 2/4 and 3/4 on a number line.", "I can use a number line to compare two fractions."],
        introduction: "Starter (5 min): fraction strip recall. Show 1/2, 2/4 and 4/8 and ask which is biggest.",
        explanation: "Model a 0 to 1 number line split into quarters. Place 1/4, 2/4 and 3/4, then show that 2/4 lands on the same point as 1/2.",
        activity: "Guided practice (10 min): pairs place fraction cards on a floor number line and explain each placement.",
        knowledgeCheck: [
          { prompt: "Where does 3/4 sit on a line from 0 to 1?", options: ["Just after 0", "Between 1/2 and 1", "After 1"], answerIndex: 1, hint: "Is 3/4 more or less than a half?", explanation: "3/4 is more than 1/2 and less than 1." },
          { prompt: "Which is bigger: 3/8 or 1/2?", options: ["3/8", "1/2", "They are equal"], answerIndex: 1, hint: "1/2 is the same as 4/8.", explanation: "1/2 = 4/8, which is more than 3/8." },
        ],
        worksheet: "Support: halves and quarters with strips\nCore: mark eighths on a number line\nStretch: place 5/4 and 3/2 on a line from 0 to 2",
        assessment: "Exit ticket (5 min): mark 3/8 and 1/2 on a line. Which is bigger?",
        nextActivity: "Next lesson: comparing fractions using a number line.",
      },
    };
    const noteInput = { ...base, tool: "parent_note" as const, topic: "fractions this month", outcomeCode: "", notes: "" };
    const noteCtx: PromptContext = { ...noteInput, className: cls.name, subject: "Mathematics" };
    const note: StoredDraft = { input: noteInput, source: "template", content: templateDraft("parent_note", noteCtx) };
    await db.aiDraft.createMany({ data: [
      { schoolId: sara.schoolId, teacherId: sara.id, tool: "lesson", prompt: buildPrompt("lesson", lessonCtx).user, output: lesson as object, createdAt: ago(1) },
      { schoolId: sara.schoolId, teacherId: sara.id, tool: "parent_note", prompt: buildPrompt("parent_note", noteCtx).user, output: note as object, createdAt: ago(0.2) },
    ] });
  }

  // ---------- Manual recommendations ----------
  const recs = [
    { email: "zara@crescentbay.example", kind: "REVIEW", title: "Number line warm-up, 10 minutes", status: "ACTIVE" as const, note: "Zara is mixing up adding and multiplying when making equivalent fractions. A visual warm-up first." },
    { email: "kenji@crescentbay.example", kind: "CHALLENGE", title: "Find all fractions between 1/3 and 1/2 with denominator up to 12", status: "PENDING_REVIEW" as const, note: "Finished every fractions task early this week." },
  ];
  for (const r of recs) {
    const st = await db.user.findUnique({ where: { email: r.email } });
    if (!st) continue;
    if (await db.recommendation.findFirst({ where: { studentId: st.id, title: r.title } })) continue;
    await db.recommendation.create({
      data: { schoolId: sara.schoolId, studentId: st.id, kind: r.kind, title: r.title, status: r.status, evidence: ["Added by Sara Mitchell", `Teacher note: ${r.note}`], createdAt: ago(1) },
    });
  }
}
