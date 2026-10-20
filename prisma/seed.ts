// Seeds two fictional schools in two organisations so multi-school isolation can be tested.
// Every person, school and result here is made up. Dates are relative to "now"
// so the demo always shows a current week.
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { applyLatePenalty, autoScore, daysLate, scoreSubmission } from "../src/lib/grading";
import { recommendFromResult } from "../src/lib/recommend";
import { seedModules } from "./seed/modules";

const db = new PrismaClient();
const PASSWORD = "Educop!2026";
const DAY = 86_400_000;
const now = new Date();
const at = (dayOffset: number, hour: number, min = 0) => {
  // Times are Gulf Standard Time (UTC+4).
  const d = new Date(now.getTime() + dayOffset * DAY);
  d.setUTCHours(hour - 4, min, 0, 0);
  return d;
};

type KC = { prompt: string; options: string[]; answerIndex: number; hint: string; explanation: string };

async function main() {
  // On deploys the seed runs with --if-empty so it never wipes a database that already has data.
  if (process.argv.includes("--if-empty") && (await db.school.count()) > 0) {
    console.log("Database already has schools; adding any missing module demo data only.");
    await seedModules(db);
    return;
  }
  // Clear in dependency order so the seed can be re-run.
  await db.$transaction([
    db.recordingView.deleteMany(), db.recording.deleteMany(),
    db.liveAttendance.deleteMany(), db.liveChat.deleteMany(), db.livePoll.deleteMany(), db.liveSession.deleteMany(),
    db.notification.deleteMany(), db.consent.deleteMany(), db.message.deleteMany(), db.moderationItem.deleteMany(),
    db.cognitiveSession.deleteMany(), db.selCheckin.deleteMany(), db.selGoal.deleteMany(),
    db.pointEvent.deleteMany(), db.studentBadge.deleteMany(), db.aiMessage.deleteMany(), db.aiDraft.deleteMany(),
    db.auditLog.deleteMany(), db.recommendation.deleteMany(), db.answer.deleteMany(), db.submission.deleteMany(),
    db.question.deleteMany(), db.assignment.deleteMany(), db.lessonProgress.deleteMany(), db.lesson.deleteMany(),
    db.enrollment.deleteMany(), db.class.deleteMany(), db.subject.deleteMany(), db.parentStudent.deleteMany(),
    db.user.deleteMany(), db.academicYear.deleteMany(), db.school.deleteMany(), db.organization.deleteMany(),
  ]);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const user = (data: Omit<Prisma.UserUncheckedCreateInput, "passwordHash">) =>
    db.user.create({ data: { ...data, passwordHash } });

  await user({ role: "SUPER_ADMIN", email: "platform@educop.example", name: "Nadia Rahman", schoolId: null });

  // ---------- School 1 ----------
  const org1 = await db.organization.create({ data: { name: "Crescent Learning Group" } });
  const s1 = await db.school.create({ data: { organizationId: org1.id, name: "Crescent Bay International School", slug: "crescent-bay", city: "Dubai" } });
  const y1 = await db.academicYear.create({ data: { schoolId: s1.id, name: "2026–27", startsOn: new Date("2026-08-25"), endsOn: new Date("2027-07-02"), isCurrent: true } });
  const [math, sci, eng] = await Promise.all([
    db.subject.create({ data: { schoolId: s1.id, name: "Mathematics", code: "MA", color: "blue" } }),
    db.subject.create({ data: { schoolId: s1.id, name: "Science", code: "SC", color: "teal" } }),
    db.subject.create({ data: { schoolId: s1.id, name: "English", code: "EN", color: "warn" } }),
  ]);

  await user({ role: "SCHOOL_ADMIN", email: "admin@crescentbay.example", name: "Daniel Okafor", schoolId: s1.id });
  const sara = await user({ role: "TEACHER", email: "sara.mitchell@crescentbay.example", name: "Sara Mitchell", schoolId: s1.id });
  const grace = await user({ role: "TEACHER", email: "grace.lin@crescentbay.example", name: "Grace Lin", schoolId: s1.id });
  const priya = await user({ role: "TEACHER", email: "priya.patel@crescentbay.example", name: "Priya Patel", schoolId: s1.id });

  const names: [string, string][] = [
    ["Layla Hassan", "layla"], ["Ethan Brooks", "ethan"], ["Aisha Rahman", "aisha"], ["Noah Fernandes", "noah"],
    ["Zara Malik", "zara"], ["Kenji Watanabe", "kenji"], ["Sofia Petrova", "sofia"], ["Hamdan Al Suwaidi", "hamdan"],
  ];
  const students = [];
  for (const [name, handle] of names) {
    students.push(await user({ role: "STUDENT", email: `${handle}@crescentbay.example`, name, schoolId: s1.id, gradeLevel: 5 }));
  }
  const layla = students[0];
  const adam = await user({ role: "STUDENT", email: "adam@crescentbay.example", name: "Adam Hassan", schoolId: s1.id, gradeLevel: 2 });
  const rania = await user({ role: "PARENT", email: "rania.hassan@example.com", name: "Rania Hassan", schoolId: s1.id });
  await db.parentStudent.createMany({ data: [
    { parentId: rania.id, studentId: layla.id, verified: true },
    { parentId: rania.id, studentId: adam.id, verified: true },
  ] });

  const mk = (name: string, subjectId: string, teacherId: string, gradeLevel: number) =>
    db.class.create({ data: { schoolId: s1.id, academicYearId: y1.id, subjectId, teacherId, name, gradeLevel } });
  const c5bMath = await mk("5B Mathematics", math.id, sara.id, 5);
  const c5bSci = await mk("5B Science", sci.id, grace.id, 5);
  const c5bEng = await mk("5B English", eng.id, priya.id, 5);
  const c5cMath = await mk("5C Mathematics", math.id, sara.id, 5);
  for (const c of [c5bMath, c5bSci, c5bEng]) {
    await db.enrollment.createMany({ data: students.map((s) => ({ classId: c.id, studentId: s.id })) });
  }

  const lesson = (data: Omit<Prisma.LessonUncheckedCreateInput, "schoolId">) =>
    db.lesson.create({ data: { schoolId: s1.id, ...data } });

  const eqKC: KC[] = [
    { prompt: "Which fraction is equivalent to 1/2?", options: ["2/3", "3/6", "1/4", "2/5"], answerIndex: 1, hint: "Is the top number half of the bottom number?", explanation: "3 is half of 6, so 3/6 = 1/2." },
    { prompt: "To make an equivalent fraction you can…", options: ["Add the same number to top and bottom", "Multiply top and bottom by the same number", "Multiply only the top", "Swap the numbers"], answerIndex: 1, hint: "Think about cutting every piece into smaller equal pieces.", explanation: "Multiplying both by the same number keeps the value the same." },
    { prompt: "2/5 = ?/10", options: ["4", "5", "2", "7"], answerIndex: 0, hint: "5 × 2 = 10. What happens to the top?", explanation: "5 × 2 = 10, so 2 × 2 = 4, giving 4/10." },
  ];

  const lComparing = await lesson({
    classId: c5bMath.id, authorId: sara.id, title: "Comparing fractions", outcomeCode: "G5-NUM-FR-03 (sample)",
    scheduledFor: at(-1, 9), durationMin: 30, status: "PUBLISHED", publishedAt: at(-3, 15),
    objectives: ["I can compare fractions with the same denominator.", "I can compare unit fractions."],
    introduction: "Would you rather have 1/3 or 1/5 of a cake? Talk to your partner about why.",
    explanation: "When the denominators are the same, compare the numerators: 3/8 is more than 2/8. For unit fractions, the bigger the denominator, the smaller each piece: 1/3 > 1/5.",
    activity: "Use your fraction wall to find three pairs of fractions and write < or > between them.",
    knowledgeCheck: [
      { prompt: "Which is bigger: 3/8 or 5/8?", options: ["3/8", "5/8", "They are equal"], answerIndex: 1, hint: "The pieces are the same size.", explanation: "Same-size pieces, and 5 pieces is more than 3." },
      { prompt: "Which is bigger: 1/4 or 1/6?", options: ["1/4", "1/6"], answerIndex: 0, hint: "Fewer pieces means bigger pieces.", explanation: "Quarters are bigger than sixths." },
    ] satisfies KC[],
    worksheet: "1) 2/7 _ 5/7\n2) 1/9 _ 1/3\n3) Order 3/10, 7/10, 1/10\n4) Explain how you know 1/2 > 1/8.",
    nextActivity: "Next lesson: equivalent fractions.",
  });
  const lEquivalent = await lesson({
    classId: c5bMath.id, authorId: sara.id, title: "Equivalent fractions", outcomeCode: "G5-NUM-FR-04 (sample)",
    scheduledFor: at(0, 9), durationMin: 30, status: "PUBLISHED", publishedAt: at(-2, 15),
    objectives: ["I can explain what equivalent fractions are.", "I can make equivalent fractions by multiplying the numerator and denominator by the same number.", "I can use fraction strips to show two fractions are equal."],
    introduction: "Hamdan cuts his pizza into 2 big slices and eats 1. Zara cuts the same size pizza into 4 slices and eats 2. Who ate more?",
    explanation: "When we cut each piece into smaller equal pieces, the number of pieces changes but the amount stays the same. 1/2 → multiply top and bottom by 2 → 2/4. Multiply by 4 → 4/8. All three show the same amount.",
    activity: "Fold a paper strip in half, then in half again, then once more. Shade half the strip. How many eighths did you shade? Write the equivalent fractions you made.",
    knowledgeCheck: eqKC,
    worksheet: "1) 1/3 = ?/9\n2) 2/7 = 4/?\n3) Write three fractions equal to 1/4\n4) Odd one out: 2/6, 3/9, 4/10, 5/15\n5) Simplify 12/18\n6) Draw a strip that shows 2/5 = 4/10",
    nextActivity: "Complete the 'Equivalent fractions check-in' assignment.",
  });
  await lesson({
    classId: c5bMath.id, authorId: sara.id, title: "Fractions on a number line", outcomeCode: "G5-NUM-FR-05 (sample)",
    scheduledFor: at(1, 9), durationMin: 30, status: "DRAFT",
    objectives: ["I can place fractions on a number line from 0 to 1."],
    introduction: "Where would 1/2 sit on a ruler?", explanation: "Split the line from 0 to 1 into equal parts given by the denominator.",
    activity: "Place fraction cards on the floor number line.", knowledgeCheck: [], worksheet: "", nextActivity: "",
  });
  await lesson({
    classId: c5bSci.id, authorId: grace.id, title: "The water cycle", outcomeCode: "SC-5-WC-01 (sample)",
    scheduledFor: at(0, 11, 20), durationMin: 40, status: "PUBLISHED", publishedAt: at(-2, 12),
    objectives: ["I can name the four stages of the water cycle.", "I can explain evaporation and condensation."],
    introduction: "Where does a puddle go on a sunny day?",
    explanation: "Water evaporates when heated, condenses into clouds when it cools, falls as precipitation, and collects in seas, lakes and the ground.",
    activity: "Make a water cycle in a bag and tape it to a sunny window.",
    knowledgeCheck: [
      { prompt: "What is it called when water vapour cools and forms clouds?", options: ["Evaporation", "Condensation", "Precipitation"], answerIndex: 1, hint: "Think of a cold glass on a hot day.", explanation: "Cooling vapour turns back into droplets: condensation." },
    ] satisfies KC[],
    worksheet: "Label the diagram: evaporation, condensation, precipitation, collection.",
    nextActivity: "Complete 'Label the water cycle'.",
  });
  await lesson({
    classId: c5bEng.id, authorId: priya.id, title: "Reading: The Desert Fox, chapter 3", scheduledFor: at(0, 7, 45), durationMin: 40,
    status: "PUBLISHED", publishedAt: at(-1, 12), objectives: ["I can find evidence for a character's feelings."],
    introduction: "How do you know when a friend is nervous?", explanation: "Authors show feelings through actions and dialogue.",
    activity: "Find two quotes that show how the fox feels.", knowledgeCheck: [], worksheet: "", nextActivity: "",
  });

  // ---------- Assignments ----------
  type Q = { type: "MCQ" | "SHORT"; prompt: string; options?: string[]; answerIndex?: number; points: number };
  async function assignment(data: { classId: string; authorId: string; lessonId?: string; title: string; instructions: string; dueAt: Date; status: "DRAFT" | "PUBLISHED"; schoolId?: string }, qs: Q[]) {
    return db.assignment.create({
      data: {
        schoolId: data.schoolId ?? s1.id, classId: data.classId, authorId: data.authorId, lessonId: data.lessonId,
        title: data.title, instructions: data.instructions, dueAt: data.dueAt, status: data.status,
        publishedAt: data.status === "PUBLISHED" ? at(-2, 14) : null,
        questions: { create: qs.map((q, i) => ({ order: i, type: q.type, prompt: q.prompt, options: q.options ?? [], answerIndex: q.answerIndex, points: q.points })) },
      },
      include: { questions: { orderBy: { order: "asc" } } },
    });
  }

  const compQuiz = await assignment({ classId: c5bMath.id, authorId: sara.id, lessonId: lComparing.id, title: "Comparing fractions quiz", instructions: "Five questions. Use your fraction wall if it helps.", dueAt: at(-1, 15), status: "PUBLISHED" }, [
    { type: "MCQ", prompt: "Which is bigger: 4/9 or 7/9?", options: ["4/9", "7/9", "Equal"], answerIndex: 1, points: 2 },
    { type: "MCQ", prompt: "Which is smaller: 1/3 or 1/8?", options: ["1/3", "1/8"], answerIndex: 1, points: 2 },
    { type: "MCQ", prompt: "Order from smallest: 5/6, 1/6, 3/6", options: ["1/6, 3/6, 5/6", "5/6, 3/6, 1/6", "3/6, 1/6, 5/6"], answerIndex: 0, points: 2 },
    { type: "MCQ", prompt: "True or false: 1/2 > 1/10", options: ["True", "False"], answerIndex: 0, points: 2 },
    { type: "SHORT", prompt: "Explain how you know 1/4 is bigger than 1/7.", points: 2 },
  ]);
  await assignment({ classId: c5bMath.id, authorId: sara.id, lessonId: lEquivalent.id, title: "Equivalent fractions check-in", instructions: "Answer all questions. Show your thinking in the last one.", dueAt: at(2, 15), status: "PUBLISHED" }, [
    { type: "MCQ", prompt: "Which fraction is equal to 1/2?", options: ["2/3", "3/6", "2/5", "4/6"], answerIndex: 1, points: 1 },
    { type: "MCQ", prompt: "3/4 = ?/8", options: ["4", "5", "6", "7"], answerIndex: 2, points: 1 },
    { type: "MCQ", prompt: "Which is NOT equivalent to 2/3?", options: ["4/6", "6/9", "8/12", "3/4"], answerIndex: 3, points: 1 },
    { type: "MCQ", prompt: "Simplify 8/12", options: ["2/3", "4/6", "3/4", "1/2"], answerIndex: 0, points: 1 },
    { type: "SHORT", prompt: "Write two fractions equivalent to 3/5 and explain how you found them.", points: 2 },
  ]);
  await assignment({ classId: c5bSci.id, authorId: grace.id, title: "Label the water cycle", instructions: "Choose the correct stage for each description.", dueAt: at(3, 15), status: "PUBLISHED" }, [
    { type: "MCQ", prompt: "Water heated by the sun turns into vapour.", options: ["Evaporation", "Condensation", "Collection"], answerIndex: 0, points: 1 },
    { type: "MCQ", prompt: "Rain, snow or hail falling from clouds.", options: ["Collection", "Precipitation", "Evaporation"], answerIndex: 1, points: 1 },
  ]);
  await assignment({ classId: c5bMath.id, authorId: sara.id, title: "Fractions on a number line practice", instructions: "Draft.", dueAt: at(5, 15), status: "DRAFT" }, [
    { type: "MCQ", prompt: "Which point shows 1/4 on a line from 0 to 1?", options: ["A", "B", "C"], answerIndex: 0, points: 1 },
  ]);

  // Graded past quiz, run through the same grading and recommendation rules as the app.
  const choices = [[0, 1, 1, 1], [1, 1, 0, 0], [0, 0, 1, 0], [1, 1, 0, 0], [1, 0, 0, 0], [1, 1, 0, 0], [0, 0, 1, 1], [1, 1, 0, 0]];
  const shortScores = [1, 2, 0, 2, 1, 2, 0, null];
  for (let i = 0; i < students.length; i++) {
    const st = students[i];
    if (i === 6) continue; // Sofia didn't submit
    const submittedAt = i === 4 ? at(0, 8) : at(-2, 18); // Zara one day late
    const late = daysLate(compQuiz.dueAt, submittedAt);
    const answers = compQuiz.questions.map((q, qi) => {
      if (q.type === "MCQ") {
        const c = choices[i][qi] === 1 ? q.answerIndex! : (q.answerIndex! + 1) % q.options.length;
        return { questionId: q.id, choiceIndex: c, autoScore: autoScore({ ...q, type: "MCQ" }, c), text: null as string | null, teacherScore: null as number | null };
      }
      return { questionId: q.id, choiceIndex: null, autoScore: null, text: "Because the whole is split into fewer pieces, so each piece is bigger.", teacherScore: shortScores[i] };
    });
    const { raw, max, fullyGraded } = scoreSubmission(compQuiz.questions.map((q) => ({ ...q, type: q.type })), answers);
    const final = applyLatePenalty(raw, compQuiz, late);
    await db.submission.create({
      data: {
        assignmentId: compQuiz.id, studentId: st.id, status: fullyGraded ? "GRADED" : "SUBMITTED", submittedAt, daysLate: late,
        rawScore: raw, maxScore: max, finalScore: fullyGraded ? final : null, gradedAt: fullyGraded ? at(0, 7) : null,
        feedback: fullyGraded ? (final >= 8 ? "Excellent reasoning about piece sizes." : "Good effort. Remember: more pieces means smaller pieces.") : null,
        answers: { create: answers.map(({ questionId, choiceIndex, autoScore: a, text, teacherScore }) => ({ questionId, choiceIndex, autoScore: a, text, teacherScore })) },
      },
    });
    if (fullyGraded) {
      const rec = recommendFromResult({ assignmentTitle: compQuiz.title, lesson: { id: lComparing.id, title: lComparing.title }, finalScore: final, maxScore: max });
      if (rec) await db.recommendation.create({ data: { schoolId: s1.id, studentId: st.id, ...rec } });
    }
  }
  await db.lessonProgress.create({ data: { lessonId: lComparing.id, studentId: layla.id, completedSteps: [0, 1, 2, 3, 4, 5, 6, 7], checkCorrect: 1, checkTotal: 2, completedAt: at(-1, 10) } });
  await db.lessonProgress.create({ data: { lessonId: lEquivalent.id, studentId: layla.id, completedSteps: [0, 1], checkCorrect: 0, checkTotal: 0 } });

  // ---------- School 2 (separate organisation) ----------
  const org2 = await db.organization.create({ data: { name: "Palm Grove Education" } });
  const s2 = await db.school.create({ data: { organizationId: org2.id, name: "Palm Grove Academy", slug: "palm-grove", city: "Abu Dhabi", curriculum: "American" } });
  const y2 = await db.academicYear.create({ data: { schoolId: s2.id, name: "2026–27", startsOn: new Date("2026-08-24"), endsOn: new Date("2027-06-25"), isCurrent: true } });
  const math2 = await db.subject.create({ data: { schoolId: s2.id, name: "Mathematics", code: "MA" } });
  const omar = await user({ role: "TEACHER", email: "omar.farouk@palmgrove.example", name: "Omar Farouk", schoolId: s2.id });
  await user({ role: "SCHOOL_ADMIN", email: "admin@palmgrove.example", name: "Leena Haddad", schoolId: s2.id });
  const s2students = [];
  for (const [name, handle] of [["Maya Chen", "maya"], ["Ravi Iyer", "ravi"], ["Lina Saeed", "lina"]]) {
    s2students.push(await user({ role: "STUDENT", email: `${handle}@palmgrove.example`, name, schoolId: s2.id, gradeLevel: 6 }));
  }
  const c6a = await db.class.create({ data: { schoolId: s2.id, academicYearId: y2.id, subjectId: math2.id, teacherId: omar.id, name: "6A Mathematics", gradeLevel: 6 } });
  await db.enrollment.createMany({ data: s2students.map((s) => ({ classId: c6a.id, studentId: s.id })) });
  await db.lesson.create({ data: {
    schoolId: s2.id, classId: c6a.id, authorId: omar.id, title: "Introduction to ratios", scheduledFor: at(0, 10), status: "PUBLISHED", publishedAt: at(-1, 10),
    objectives: ["I can write a ratio in three ways."], introduction: "Count the boys and girls in the room.", explanation: "A ratio compares two quantities: 3:2, 3 to 2, or 3/2.",
    activity: "Write ratios for objects on your desk.", knowledgeCheck: [], worksheet: "", nextActivity: "",
  } });
  await assignment({ schoolId: s2.id, classId: c6a.id, authorId: omar.id, title: "Ratio warm-up", instructions: "Two quick questions.", dueAt: at(2, 15), status: "PUBLISHED" }, [
    { type: "MCQ", prompt: "Simplify 6:4", options: ["3:2", "2:3", "6:4"], answerIndex: 0, points: 1 },
  ]);

  await seedModules(db);
  console.log(`Seeded 2 schools. Password for every demo account: ${PASSWORD}`);
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
