// Pure rules that turn a child's active suggestions and this week's lessons into
// short things a family can do at home. Template text only (no AI), so it is
// deterministic and always available.

export type HomeRec = { id: string; kind: string; title: string; lessonTitle?: string | null };
export type HomeLesson = { id: string; title: string; subject: string; worksheet: string; nextActivity: string; scheduledFor: Date };
export type HomeActivity = { key: string; minutes: number; title: string; body: string; source: string };

const firstLines = (s: string, n: number) => s.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, n);

export function homeActivities(recs: HomeRec[], lessons: HomeLesson[]): HomeActivity[] {
  const out: HomeActivity[] = [];
  for (const r of recs) {
    const topic = r.lessonTitle ?? r.title;
    if (r.kind === "REVIEW") {
      out.push({ key: `rec:${r.id}`, minutes: 15, title: `Talk it through: ${topic}`, body: `Ask your child to teach you what they learned in "${topic}" using a drawing or everyday objects. Praise the explaining, not just the answer.`, source: "Suggested by the teacher" });
    } else if (r.kind === "CHALLENGE") {
      out.push({ key: `rec:${r.id}`, minutes: 15, title: `Stretch together: ${topic}`, body: `Your child is ready for a challenge. Ask them to make up a harder question about "${topic}" for you to solve, then check it together.`, source: "Suggested by the teacher" });
    } else {
      out.push({ key: `rec:${r.id}`, minutes: 10, title: `Quick practice: ${topic}`, body: `Ten minutes of practice on "${topic}". Little and often works better than one long session.`, source: "Suggested by the teacher" });
    }
  }
  for (const l of lessons) {
    const items = firstLines(l.worksheet, 2);
    if (items.length) {
      out.push({ key: `lesson:${l.id}:ws`, minutes: 10, title: `Try the worksheet: ${l.title}`, body: `Have a go at a couple of questions together: ${items.join(" · ")}`, source: `${l.subject} lesson` });
    }
    out.push({ key: `lesson:${l.id}:ask`, minutes: 5, title: "Ask about today", body: l.nextActivity.trim() ? `"What did you learn in ${l.title}?" Next in class: ${l.nextActivity.trim()}` : `"What was the hardest part of ${l.title}? What helped?"`, source: `${l.subject} lesson` });
  }
  return out;
}

/** Keys of activities a parent marked "we did this", read from User.prefs. */
export function doneKeys(prefs: unknown): Record<string, string> {
  const v = (prefs as { homeLearningDone?: unknown } | null)?.homeLearningDone;
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([, d]) => typeof d === "string")) as Record<string, string>;
}

/** Toggles one key and keeps the newest 200 so prefs can't grow without bound. */
export function toggleDone(prefs: unknown, key: string, done: boolean, at = new Date()) {
  const cur = doneKeys(prefs);
  if (done) cur[key] = at.toISOString();
  else delete cur[key];
  const kept = Object.entries(cur).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 200);
  const base = prefs && typeof prefs === "object" && !Array.isArray(prefs) ? prefs : {};
  return { ...base, homeLearningDone: Object.fromEntries(kept) };
}
