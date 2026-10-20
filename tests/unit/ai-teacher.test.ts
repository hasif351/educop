import { describe, expect, it } from "vitest";
import {
  buildPrompt, draftText, extractJson, lessonFields, parseDraft, quizQuestionRows, templateDraft, ToolInput, validateDraft,
  TOOL_KEYS, type PromptContext,
} from "@/lib/ai-teacher";

const ctx: PromptContext = {
  className: "5B Mathematics", subject: "Mathematics", grade: 5, topic: "equivalent fractions",
  outcomeCode: "G5-NUM-FR-04", notes: "Mixed ability", questionCount: 4,
};

describe("tool input", () => {
  it("applies defaults and limits", () => {
    const r = ToolInput.parse({ tool: "quiz", classId: "c1", topic: "  fractions ", grade: "5" });
    expect(r).toMatchObject({ topic: "fractions", grade: 5, questionCount: 5, outcomeCode: "", notes: "" });
    expect(ToolInput.safeParse({ tool: "quiz", classId: "c1", topic: "x", grade: 5 }).success).toBe(false);
    expect(ToolInput.safeParse({ tool: "essay", classId: "c1", topic: "fractions", grade: 5 }).success).toBe(false);
    expect(ToolInput.safeParse({ tool: "lesson", classId: "c1", topic: "fractions", grade: 13 }).success).toBe(false);
  });
});

describe("parsing model replies", () => {
  it("finds JSON inside prose and code fences", () => {
    expect(extractJson('Here you go:\n```json\n{"subject":"Hi","body":"Text"}\n```')).toEqual({ subject: "Hi", body: "Text" });
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson("{ broken")).toBeNull();
  });

  it("accepts a valid quiz and fills defaults", () => {
    const r = parseDraft("quiz", JSON.stringify({
      title: "Fractions quiz",
      questions: [
        { type: "MCQ", prompt: "1/2 = ?/4", options: ["1", "2", "3"], answerIndex: 1 },
        { type: "SHORT", prompt: "Explain why." },
      ],
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.instructions).toBe("");
      expect(r.data.questions[0].points).toBe(1);
      expect(r.data.questions[1].points).toBe(2);
    }
  });

  it("rejects an MCQ whose answer is out of range", () => {
    const r = parseDraft("quiz", JSON.stringify({ title: "Quiz", questions: [{ type: "MCQ", prompt: "Q", options: ["a", "b"], answerIndex: 2 }] }));
    expect(r.ok).toBe(false);
  });

  it("rejects a lesson missing required parts, with the field named", () => {
    const r = parseDraft("lesson", JSON.stringify({ title: "Fractions", objectives: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/objectives|introduction/);
  });

  it("rejects overlong text", () => {
    const r = validateDraft("parent_note", { subject: "Update", body: "x".repeat(3001) });
    expect(r.ok).toBe(false);
  });

  it("rejects a reply that is not JSON", () => {
    expect(parseDraft("feedback", "Sorry, I can't help with that.")).toEqual({ ok: false, error: "The reply was not JSON." });
  });
});

describe("prompts", () => {
  it("asks for strict JSON and passes the inputs", () => {
    const p = buildPrompt("lesson", ctx);
    expect(p.system).toMatch(/single JSON object/);
    expect(p.system).toMatch(/Never mention IQ/);
    expect(p.user).toContain("equivalent fractions");
    expect(p.user).toContain("G5-NUM-FR-04");
    expect(p.user).toContain("Grade 5");
  });

  it("includes the submission answers for feedback but only the first name", () => {
    const p = buildPrompt("feedback", { ...ctx, submission: { assignmentTitle: "Check-in", studentFirstName: "Zara", items: [{ prompt: "3/4 = ?/8", type: "MCQ", answer: "7", points: 1, score: 0, correctAnswer: "6" }] } });
    expect(p.user).toContain("Zara");
    expect(p.user).toContain("Answer: 7");
    expect(p.user).toContain("Correct answer: 6");
  });
});

describe("template fallback", () => {
  it("produces a valid draft for every tool", () => {
    for (const tool of TOOL_KEYS) {
      const d = templateDraft(tool, ctx);
      expect(validateDraft(tool, d).ok, tool).toBe(true);
    }
  });

  it("is deterministic and built from the inputs", () => {
    expect(templateDraft("lesson", ctx)).toEqual(templateDraft("lesson", ctx));
    const q = templateDraft("quiz", ctx);
    expect(q.questions).toHaveLength(4);
    expect(q.questions.at(-1)?.type).toBe("SHORT");
    expect(q.instructions).toContain("G5-NUM-FR-04");
    expect(templateDraft("parent_note", ctx).subject).toContain("5B Mathematics");
  });

  it("feedback uses the marked scores and names a question to revisit", () => {
    const f = templateDraft("feedback", { ...ctx, submission: { assignmentTitle: "Check-in", studentFirstName: "Layla", items: [
      { prompt: "Q1", type: "MCQ", answer: "a", points: 1, score: 1 },
      { prompt: "Explain 3/5", type: "SHORT", answer: "…", points: 2, score: 1 },
      { prompt: "Q3", type: "SHORT", answer: "…", points: 2, score: null },
    ] } });
    expect(f.feedback).toContain("Layla");
    expect(f.feedback).toContain("2/3");
    expect(f.feedback).toContain("Explain 3/5");
  });
});

describe("conversion", () => {
  it("turns a lesson draft into lesson fields with the 8-part content", () => {
    const f = lessonFields(templateDraft("lesson", ctx));
    expect(f.objectives.length).toBeGreaterThan(0);
    expect(f.knowledgeCheck[0]).toHaveProperty("answerIndex", 0);
    expect(f).not.toHaveProperty("assessment");
  });

  it("turns a quiz into ordered question rows", () => {
    const rows = quizQuestionRows(templateDraft("quiz", ctx));
    expect(rows.map((r) => r.order)).toEqual([0, 1, 2, 3]);
    expect(rows[3]).toMatchObject({ type: "SHORT", options: [], answerIndex: null });
  });

  it("builds copyable text", () => {
    expect(draftText("feedback", { feedback: "Good work.", nextStep: "Try 2/3." })).toBe("Good work.\n\nNext step: Try 2/3.");
    expect(draftText("lesson", {})).toBe("");
  });
});
