// "My growth" (social-emotional learning). Check-ins are private to the
// student unless they tick "share with my teacher". Class views only ever show
// anonymous totals for groups of MIN_GROUP or more. Pure functions only.

export const MIN_GROUP = 5;

export const MOODS: { value: number; label: string; emoji: string }[] = [
  { value: 1, label: "Really low", emoji: "😞" },
  { value: 2, label: "A bit low", emoji: "🙁" },
  { value: 3, label: "Okay", emoji: "😐" },
  { value: 4, label: "Good", emoji: "🙂" },
  { value: 5, label: "Great", emoji: "😄" },
];

export const FEELINGS = ["Calm", "Curious", "Excited", "Proud", "Tired", "Worried", "Frustrated", "Not sure"] as const;
const LOW_FEELINGS = ["Tired", "Worried", "Frustrated"];

/** Mood 0 marks a scenario reflection saved without a mood check-in. */
export const REFLECTION_ONLY = 0;

export function needsCare(mood: number, feelings: string[]) {
  return (mood >= 1 && mood <= 2) || feelings.some((f) => LOW_FEELINGS.includes(f));
}

export type Scenario = { id: string; title: string; tag: string; text: string; options: { text: string; thought: string }[] };

export const SCENARIOS: Scenario[] = [
  {
    id: "group-project", title: "The group project", tag: "Teamwork",
    text: "Your group is building a model. Two classmates both want to be the one who paints it. What could you do?",
    options: [
      { text: "Ask each person what they enjoy and split the jobs fairly", thought: "Talking it through helps everyone feel heard." },
      { text: "Take turns: one does it today, the other next time", thought: "Taking turns is a fair way to share." },
      { text: "Ask the teacher to decide", thought: "Asking for help is fine, especially if you feel stuck." },
      { text: "Just do the job yourself", thought: "Sometimes quicker, but others may feel left out. What else could work?" },
    ],
  },
  {
    id: "hard-homework", title: "Stuck on homework", tag: "Resilience",
    text: "You've tried a maths question three times and it still doesn't work. You feel like giving up. What could you do?",
    options: [
      { text: "Take a short break, then look at a worked example", thought: "A break can help your brain see it fresh." },
      { text: "Write down exactly which step is confusing and ask in class", thought: "Knowing where you're stuck is a big step." },
      { text: "Ask Nova for a hint", thought: "Hints help you get there yourself." },
      { text: "Skip it and hope it isn't checked", thought: "That's understandable when you're tired, but the question will still be tricky next time. What else could help?" },
    ],
  },
  {
    id: "new-student", title: "A new classmate", tag: "Kindness",
    text: "A new student has joined your class. At break they are standing on their own. What could you do?",
    options: [
      { text: "Say hello and ask if they want to join your game", thought: "A small hello can make a big difference." },
      { text: "Show them where things are, like the library", thought: "Helping someone find their way is kind." },
      { text: "Tell a teacher they might need a buddy", thought: "Getting an adult involved can help too." },
      { text: "Leave them alone, they'll be fine", thought: "Some people like space, but it can feel lonely on a first day. Could you check?" },
    ],
  },
  {
    id: "mistake", title: "Making a mistake", tag: "Growth mindset",
    text: "You got an answer wrong in front of the class and someone laughed. How could you handle it?",
    options: [
      { text: "Remind yourself that mistakes help you learn", thought: "Everyone learns by getting things wrong first." },
      { text: "Ask the teacher to explain the right answer", thought: "Brave! Others probably wanted to know too." },
      { text: "Talk to a friend or teacher about how it felt", thought: "Sharing feelings can make them lighter." },
      { text: "Never put your hand up again", thought: "That feeling makes sense, but your ideas matter. What would help you feel ready again?" },
    ],
  },
];

export const HABITS: { key: string; label: string }[] = [
  { key: "planner", label: "I keep my planner up to date" },
  { key: "early_homework", label: "I start homework before 6 pm" },
  { key: "pack_bag", label: "I pack my bag the night before" },
  { key: "breaks", label: "I take short breaks when I study" },
];

/** Reads the habits map from User.prefs without trusting its shape. */
export function readHabits(prefs: unknown): Record<string, boolean> {
  const h = (prefs && typeof prefs === "object" ? (prefs as Record<string, unknown>).habits : null) ?? {};
  const out: Record<string, boolean> = {};
  for (const { key } of HABITS) out[key] = typeof h === "object" && (h as Record<string, unknown>)[key] === true;
  return out;
}

// ---------------- Class aggregate (teacher view) ----------------

export type CheckinRow = { studentId: string; mood: number; feelings: string[] };

/**
 * Anonymous class summary of mood check-ins. Returns null when fewer than
 * MIN_GROUP different students checked in, so nobody can be singled out.
 */
export function aggregateCheckins(rows: CheckinRow[], minGroup = MIN_GROUP) {
  const moods = rows.filter((r) => r.mood >= 1 && r.mood <= 5);
  const students = new Set(moods.map((r) => r.studentId)).size;
  if (students < minGroup) return null;
  const moodCounts = [1, 2, 3, 4, 5].map((m) => moods.filter((r) => r.mood === m).length);
  const avg = moods.reduce((a, r) => a + r.mood, 0) / moods.length;
  const tally = new Map<string, number>();
  for (const r of moods) for (const f of r.feelings) tally.set(f, (tally.get(f) ?? 0) + 1);
  const topFeelings = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([feeling, count]) => ({ feeling, count }));
  return { students, checkins: moods.length, averageMood: Math.round(avg * 10) / 10, moodCounts, topFeelings };
}
