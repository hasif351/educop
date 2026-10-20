import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Demo data for the admin modules. Must be idempotent: it also runs against a
// database that was seeded before these modules existed (see seed/modules.ts).
const DAY = 86_400_000;

export async function seedAdmin(db: PrismaClient) {
  const school = await db.school.findUnique({ where: { slug: "crescent-bay" } });
  const grace = await db.user.findUnique({ where: { email: "grace.lin@crescentbay.example" } });
  const sara = await db.user.findUnique({ where: { email: "sara.mitchell@crescentbay.example" } });
  const rania = await db.user.findUnique({ where: { email: "rania.hassan@example.com" } });
  const sofia = await db.user.findUnique({ where: { email: "sofia@crescentbay.example" } });
  const layla = await db.user.findUnique({ where: { email: "layla@crescentbay.example" } });
  if (!school || !grace || !sara || !rania || !sofia || !layla) return;
  const now = Date.now();

  // A lesson waiting for approval. The school still publishes directly
  // (requireLessonApproval stays false) so the teacher demo flow is unchanged.
  const sci = await db.class.findFirst({ where: { schoolId: school.id, teacherId: grace.id, name: "5B Science" } });
  if (sci && !(await db.lesson.findFirst({ where: { schoolId: school.id, title: "Plant life cycles" } }))) {
    await db.lesson.create({ data: {
      schoolId: school.id, classId: sci.id, authorId: grace.id, title: "Plant life cycles", outcomeCode: "SC-5-PL-02 (sample)",
      scheduledFor: new Date(now + 3 * DAY), durationMin: 40, status: "PENDING_APPROVAL",
      objectives: ["I can name the stages of a flowering plant's life cycle.", "I can explain what pollination is."],
      introduction: "Where do new plants come from? Look at the seeds in this fruit.",
      explanation: "A flowering plant grows from a seed, becomes a seedling, then an adult plant that flowers. Pollen moves between flowers (pollination), seeds form, and are dispersed.",
      activity: "Sort the picture cards into the right order and label each stage.",
      knowledgeCheck: [{ prompt: "What happens during pollination?", options: ["Seeds are planted", "Pollen moves between flowers", "Leaves fall off"], answerIndex: 1, hint: "Think about bees.", explanation: "Bees and wind carry pollen from flower to flower." }],
      worksheet: "1) Draw the life cycle of a sunflower\n2) Name two ways seeds are dispersed",
      nextActivity: "Plant a bean in a jar and keep a growth diary.",
    } });
  }

  // A parent link waiting for the school to verify it.
  let marta = await db.user.findUnique({ where: { email: "marta.petrova@example.com" } });
  if (!marta) {
    marta = await db.user.create({ data: { role: "PARENT", email: "marta.petrova@example.com", name: "Marta Petrova", schoolId: school.id, passwordHash: await bcrypt.hash("Educop!2026", 10) } });
  }
  await db.parentStudent.upsert({ where: { parentId_studentId: { parentId: marta.id, studentId: sofia.id } }, update: {}, create: { parentId: marta.id, studentId: sofia.id, verified: false } });

  // Moderation queue: a held parent message, an AI flag and a deletion request.
  if ((await db.moderationItem.count({ where: { schoolId: school.id } })) === 0) {
    const held = await db.message.create({ data: {
      schoolId: school.id, fromId: rania.id, toId: sara.id, studentId: layla.id, held: true, createdAt: new Date(now - 2 * 3600_000),
      body: "Hi Ms Mitchell, could you call me about Layla's fractions homework? My number is 050 123 4567.",
    } });
    const flagged = await db.aiMessage.create({ data: {
      schoolId: school.id, userId: layla.id, role: "assistant", flagged: true, createdAt: new Date(now - 5 * 3600_000),
      content: "To compare 1/4 and 1/7, look at the denominators: the bigger one has bigger pieces.",
    } });
    await db.moderationItem.createMany({ data: [
      { schoolId: school.id, kind: "message", sourceId: held.id, summary: "Parent message auto-held for review (personal phone number)", createdAt: held.createdAt },
      { schoolId: school.id, kind: "ai_reply", sourceId: flagged.id, summary: 'AI study buddy reply flagged by a student: "answer seemed wrong"', createdAt: flagged.createdAt },
      { schoolId: school.id, kind: "deletion", sourceId: null, summary: "A parent asked for a photo from the class gallery to be deleted", createdAt: new Date(now - DAY) },
    ] });
  }
  const palm = await db.school.findUnique({ where: { slug: "palm-grove" } });
  if (palm && (await db.moderationItem.count({ where: { schoolId: palm.id } })) === 0) {
    await db.moderationItem.create({ data: { schoolId: palm.id, kind: "content", summary: "Teacher-uploaded image missing licence information", createdAt: new Date(now - 2 * DAY) } });
  }
}
