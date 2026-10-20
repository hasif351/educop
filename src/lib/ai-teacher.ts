import { z } from "zod";

// Teacher AI assistant: prompt building, strict JSON validation and the
// deterministic template fallback used when no model is connected. Pure (no
// database, no "server-only") so it can be unit tested.

export const AI_TOOLS = {
  lesson: { label: "Lesson plan", blurb: "A draft in the 8-part lesson structure, ready for the lesson editor." },
  quiz: { label: "Quiz questions", blurb: "Multiple-choice and short-answer questions with an answer key." },
  feedback: { label: "Draft feedback", blurb: "Feedback on one submission: what went well and one next step." },
  differentiate: { label: "Differentiated tasks", blurb: "Support, core and stretch versions of the same task." },
  parent_note: { label: "Parent update", blurb: "A short, plain-language note for families." },
} as const;
export type AiTool = keyof typeof AI_TOOLS;
export const TOOL_KEYS = Object.keys(AI_TOOLS) as [AiTool, ...AiTool[]];

export const SOURCE_LABEL = {
  ai: "AI draft - review before use",
  template: "Template suggestion (AI not connected)",
} as const;

// ---------------- Inputs ----------------

export const ToolInput = z.object({
  tool: z.enum(TOOL_KEYS),
  classId: z.string().min(1, "Choose a class."),
  topic: z.string().trim().min(3, "Say what the topic is.").max(160),
  outcomeCode: z.string().trim().max(60).default(""),
  grade: z.coerce.number().int().min(-1).max(12),
  notes: z.string().trim().max(1000).default(""),
  questionCount: z.coerce.number().int().min(2).max(10).default(5),
  submissionId: z.string().max(40).default(""),
});
export type ToolInput = z.infer<typeof ToolInput>;

/** What a submission looks like in a feedback prompt. Only the first name is sent. */
export type SubmissionContext = {
  assignmentTitle: string;
  studentFirstName: string;
  items: { prompt: string; type: "MCQ" | "SHORT"; answer: string; points: number; score: number | null; correctAnswer?: string }[];
};

export type PromptContext = {
  className: string;
  subject: string;
  grade: number;
  topic: string;
  outcomeCode: string;
  notes: string;
  questionCount: number;
  submission?: SubmissionContext;
};

export function gradeLabel(g: number) {
  return g === -1 ? "KG1" : g === 0 ? "KG2" : `Grade ${g}`;
}

// ---------------- Output schemas ----------------

const text = (max: number) => z.string().trim().max(max);
const KcItem = z.object({
  prompt: text(500).min(1),
  options: z.array(text(200).min(1)).min(2).max(6),
  answerIndex: z.number().int().min(0),
  hint: text(300).default(""),
  explanation: text(500).default(""),
}).refine((q) => q.answerIndex < q.options.length, "Each knowledge-check question needs a correct answer.");

export const LessonDraft = z.object({
  title: text(160).min(3),
  durationMin: z.number().int().min(5).max(240).default(30),
  // The editor sends one objective per line, so blank lines are dropped here.
  objectives: z.preprocess((v) => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x.trim() : x)).filter((x) => x !== "") : v), z.array(text(300).min(1)).min(1, "Add at least one objective.").max(6)),
  introduction: text(5000),
  explanation: text(10000),
  activity: text(5000),
  knowledgeCheck: z.array(KcItem).max(5).default([]),
  worksheet: text(5000),
  assessment: text(2000).default(""),
  nextActivity: text(2000),
});

// Matches the assignment builder's rules so an accepted quiz always opens cleanly there.
const QuizQuestion = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MCQ"), prompt: text(1000).min(1), options: z.array(text(300).min(1)).min(2).max(6), answerIndex: z.number().int().min(0), points: z.number().int().min(1).max(100).default(1) }),
  z.object({ type: z.literal("SHORT"), prompt: text(1000).min(1), points: z.number().int().min(1).max(100).default(2), modelAnswer: text(1000).default("") }),
]);
export const QuizDraft = z.object({
  title: text(160).min(3),
  instructions: text(5000).default(""),
  questions: z.array(QuizQuestion).min(1).max(15),
}).refine((q) => q.questions.every((x) => x.type !== "MCQ" || x.answerIndex < x.options.length), "Every multiple-choice question needs a correct option.");

export const FeedbackDraft = z.object({
  feedback: text(1500).min(1),
  nextStep: text(500).default(""),
});

export const DifferentiateDraft = z.object({
  title: text(160).min(3),
  support: text(3000).min(1),
  core: text(3000).min(1),
  stretch: text(3000).min(1),
});

export const ParentNoteDraft = z.object({
  subject: text(160).min(3),
  body: text(3000).min(1),
});

export const DRAFT_SCHEMA = {
  lesson: LessonDraft,
  quiz: QuizDraft,
  feedback: FeedbackDraft,
  differentiate: DifferentiateDraft,
  parent_note: ParentNoteDraft,
} satisfies Record<AiTool, z.ZodTypeAny>;

export type DraftContent = {
  lesson: z.infer<typeof LessonDraft>;
  quiz: z.infer<typeof QuizDraft>;
  feedback: z.infer<typeof FeedbackDraft>;
  differentiate: z.infer<typeof DifferentiateDraft>;
  parent_note: z.infer<typeof ParentNoteDraft>;
};

/** What is stored in AiDraft.output. */
export type StoredDraft = {
  input: ToolInput;
  content: unknown;
  source: "ai" | "template";
  // Set once the draft has been turned into a lesson or assignment.
  createdId?: string;
};

// ---------------- Parsing ----------------

/** Pull the first JSON object out of a model reply (it may be wrapped in prose or a code fence). */
export function extractJson(reply: string): unknown {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(reply.slice(start, end + 1)); } catch { return null; }
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function validateDraft<K extends AiTool>(tool: K, value: unknown): ParseResult<DraftContent[K]> {
  const r = DRAFT_SCHEMA[tool].safeParse(value);
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, error: `${i.path.join(".") || "draft"}: ${i.message}` };
  }
  return { ok: true, data: r.data as DraftContent[K] };
}

export function parseDraft<K extends AiTool>(tool: K, reply: string): ParseResult<DraftContent[K]> {
  const json = extractJson(reply);
  if (json === null) return { ok: false, error: "The reply was not JSON." };
  return validateDraft(tool, json);
}

// ---------------- Prompts ----------------

const SHAPES: Record<AiTool, string> = {
  lesson: `{"title": string, "durationMin": number, "objectives": string[] (2-4, each starting "I can"), "introduction": string, "explanation": string, "activity": string, "knowledgeCheck": [{"prompt": string, "options": string[] (3-4), "answerIndex": number (0-based), "hint": string, "explanation": string}] (2-3 items), "worksheet": string (one item per line), "assessment": string, "nextActivity": string}`,
  quiz: `{"title": string, "instructions": string, "questions": [{"type": "MCQ", "prompt": string, "options": string[] (3-4), "answerIndex": number (0-based), "points": 1} | {"type": "SHORT", "prompt": string, "points": 2, "modelAnswer": string}]}`,
  feedback: `{"feedback": string (3-5 sentences, speaks to the student as "you"), "nextStep": string (one concrete next step)}`,
  differentiate: `{"title": string, "support": string, "core": string, "stretch": string}`,
  parent_note: `{"subject": string, "body": string (120-200 words)}`,
};

const TASK: Record<AiTool, (c: PromptContext) => string> = {
  lesson: (c) => `Plan a ${c.topic} lesson for ${c.className}. Use the 8-part structure: objectives, introduction, explanation with examples, interactive activity, knowledge-check questions, practice worksheet, assessment idea, recommended next activity.`,
  quiz: (c) => `Write ${c.questionCount} quiz questions on ${c.topic} for ${c.className}: mostly multiple choice with one short-answer question that asks students to explain their reasoning. Mix easy, medium and harder items.`,
  feedback: (c) => `Draft feedback on ${c.submission?.studentFirstName ?? "the student"}'s work for "${c.submission?.assignmentTitle ?? c.topic}". Start with something specific they did well, address the main misconception kindly, and end with one next step.`,
  differentiate: (c) => `Write support, core and stretch versions of a task on ${c.topic} for ${c.className}. Support uses visuals and scaffolds, core is the grade-level task, stretch is open-ended.`,
  parent_note: (c) => `Write a short update for families of ${c.className} about ${c.topic}: what students learned, how they are getting on as a class, and one simple activity to try at home.`,
};

export function buildPrompt(tool: AiTool, c: PromptContext): { system: string; user: string } {
  const system = [
    "You are a teaching assistant helping a KG-12 teacher prepare materials. Everything you write is a draft the teacher reviews and edits before anything reaches students or families.",
    "Rules: write in clear British English suited to the age group. Do not invent curriculum requirements, test results, statistics or references. Use only the outcome code you are given, or none. Never label, rank or compare students. Never mention IQ. Keep feedback kind and specific.",
    `Reply with a single JSON object and nothing else, in exactly this shape: ${SHAPES[tool]}`,
  ].join("\n\n");
  const lines = [
    TASK[tool](c),
    `Subject: ${c.subject}. Year group: ${gradeLabel(c.grade)}.`,
    c.outcomeCode ? `Curriculum outcome code (from the school's map): ${c.outcomeCode}.` : "",
    c.notes ? `Teacher's notes: ${c.notes}` : "",
  ];
  if (tool === "feedback" && c.submission) {
    lines.push("The student's answers:");
    c.submission.items.forEach((it, i) => {
      const score = it.score == null ? "not marked yet" : `${it.score}/${it.points}`;
      lines.push(`${i + 1}. ${it.prompt}\n   Answer: ${it.answer || "(no answer)"}${it.correctAnswer ? `\n   Correct answer: ${it.correctAnswer}` : ""}\n   Score: ${score}`);
    });
  }
  return { system, user: lines.filter(Boolean).join("\n") };
}

// ---------------- Template fallback ----------------

// Deterministic drafts built only from the teacher's inputs, so the assistant
// still works without a model. They are honest scaffolds, not invented content.
export function templateDraft<K extends AiTool>(tool: K, c: PromptContext): DraftContent[K] {
  const t = c.topic;
  const code = c.outcomeCode ? ` (${c.outcomeCode})` : "";
  const note = c.notes ? `\nTeacher's notes: ${c.notes}` : "";
  const out: { [P in AiTool]: () => DraftContent[P] } = {
    lesson: () => ({
      title: capitalise(t),
      durationMin: 30,
      objectives: [`I can explain what ${t} means.`, `I can use ${t} to solve a problem.`, `I can check my answer and explain my thinking.`],
      introduction: `Hook: show a real-life example of ${t} and ask "What do you notice? What do you wonder?" Pairs share one idea.${note}`,
      explanation: `Model ${t} step by step with one worked example. Think aloud, then do a second example together with the class. Point out one common mistake and how to check for it.`,
      activity: `In pairs, students try three short problems on ${t} using concrete materials or drawings, then explain one answer to another pair.`,
      knowledgeCheck: [
        { prompt: `Edit me: a quick question that checks the key idea of ${t}.`, options: ["Correct answer", "Common mistake", "Another distractor"], answerIndex: 0, hint: "Think back to the worked example.", explanation: "Edit this explanation to match your question." },
      ],
      worksheet: [`1) A fluency question on ${t}`, "2) A second fluency question", "3) A question with a picture or model", `4) A word problem about ${t}`, "5) Explain how you know your answer is right."].join("\n"),
      assessment: `Exit ticket: one question on ${t}${code}. Create the quiz with the quiz tool and link it to this lesson.`,
      nextActivity: `Practise ${t} with the follow-up worksheet, then move on to the next step in the unit.`,
    }),
    quiz: () => {
      const n = Math.max(2, Math.min(10, c.questionCount));
      const mcq = Array.from({ length: n - 1 }, (_, i) => ({
        type: "MCQ" as const,
        prompt: `Question ${i + 1} on ${t}: edit this prompt.`,
        options: ["Correct answer", "Distractor (common mistake)", "Distractor"],
        answerIndex: 0,
        points: 1,
      }));
      return {
        title: `${capitalise(t)} quiz`,
        instructions: `Answer every question. Show your thinking in the last one.${code}`,
        questions: [...mcq, { type: "SHORT" as const, prompt: `Explain how you solved one ${t} question. Use a drawing or example.`, points: 2, modelAnswer: "" }],
      };
    },
    feedback: () => {
      const s = c.submission;
      const name = s?.studentFirstName ?? "there";
      const marked = s?.items.filter((i) => i.score != null) ?? [];
      const got = marked.reduce((a, i) => a + (i.score ?? 0), 0);
      const max = marked.reduce((a, i) => a + i.points, 0);
      const missed = s?.items.find((i) => i.score != null && i.score < i.points);
      return {
        feedback: [
          `Well done, ${name}, for completing ${s ? `"${s.assignmentTitle}"` : `your work on ${t}`}.`,
          max ? `You scored ${got}/${max} on the questions marked so far.` : "",
          missed ? `Have another look at "${missed.prompt}" and compare your answer with the method from class.` : "Your answers show a good understanding of the key idea.",
        ].filter(Boolean).join(" "),
        nextStep: `Try one more ${t} question and explain each step in your own words.`,
      };
    },
    differentiate: () => ({
      title: `${capitalise(t)}: three levels`,
      support: `Picture-based version of the ${t} task with a worked example at the top, sentence starters and concrete materials. Fewer items (4-5).${note}`,
      core: `The grade-level ${t} task: 6-8 items moving from practice to a word problem, with one "explain your thinking" question.`,
      stretch: `Open-ended ${t} challenge: "Find all the ways…" or "Is it always true?" Students create their own example and justify it.`,
    }),
    parent_note: () => ({
      subject: `${c.className}: our learning on ${t}`,
      body: [
        "Dear families,",
        `This week in ${c.className} we have been learning about ${t}. Students have been explaining their thinking with drawings and examples, and practising in class.`,
        `At home, you could ask your child to show you one ${t} example and explain how they solved it. Short, relaxed conversations help a lot.`,
        "Thank you for your support. Please message me through Educop if you have any questions.",
      ].join("\n\n"),
    }),
  };
  return out[tool]();
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------- Display and conversion ----------------

/** A short title for the drafts list. */
export function draftTitle(tool: AiTool, content: unknown, fallback: string) {
  const c = content as Record<string, unknown> | null;
  const named = c && typeof c === "object" ? (c.title ?? c.subject) : null;
  const label = AI_TOOLS[tool]?.label ?? "Draft";
  return `${label}: ${typeof named === "string" && named ? named : fallback}`;
}

/** Plain text for copying feedback, a parent note or differentiated tasks. */
export function draftText(tool: AiTool, content: unknown): string {
  if (tool === "feedback") {
    const f = content as DraftContent["feedback"];
    return [f.feedback, f.nextStep ? `Next step: ${f.nextStep}` : ""].filter(Boolean).join("\n\n");
  }
  if (tool === "parent_note") {
    const p = content as DraftContent["parent_note"];
    return `${p.subject}\n\n${p.body}`;
  }
  if (tool === "differentiate") {
    const d = content as DraftContent["differentiate"];
    return `${d.title}\n\nSupport: ${d.support}\n\nCore: ${d.core}\n\nStretch: ${d.stretch}`;
  }
  return "";
}

/** Lesson fields for prisma.lesson.create (the caller adds school, class, author, date). */
export function lessonFields(d: DraftContent["lesson"]) {
  return {
    title: d.title,
    durationMin: d.durationMin,
    objectives: d.objectives,
    introduction: d.introduction,
    explanation: d.explanation,
    activity: d.activity,
    knowledgeCheck: d.knowledgeCheck.map((q) => ({ prompt: q.prompt, options: q.options, answerIndex: q.answerIndex, hint: q.hint, explanation: q.explanation })),
    worksheet: d.worksheet,
    nextActivity: d.nextActivity,
  };
}

/** Question rows for prisma.question.createMany. */
export function quizQuestionRows(d: DraftContent["quiz"]) {
  return d.questions.map((q, i) => ({
    order: i,
    type: q.type,
    prompt: q.prompt,
    options: q.type === "MCQ" ? q.options : [],
    answerIndex: q.type === "MCQ" ? q.answerIndex : null,
    points: q.points,
  }));
}
