import { describe, expect, it } from "vitest";
import { novaSystemPrompt, offlineReply, screenMessage } from "@/lib/nova";
import { aggregateCheckins, needsCare, readHabits } from "@/lib/sel";
import { dayKey, learningStreak, recentDays } from "@/lib/streak";

describe("Nova safety screen", () => {
  it("lets ordinary school questions through", () => {
    for (const q of ["How do I find equal fractions?", "Check my answer: 2/3 = 4/6", "Explain the water cycle simply", "What is 123456789 in words?", "Why did the fox hit the tree in chapter 3?"]) {
      expect(screenMessage(q)).toEqual({ ok: true });
    }
  });
  it("catches possible self-harm", () => {
    const r = screenMessage("sometimes I want to hurt myself");
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.category).toBe("self_harm"); expect(r.reply).toMatch(/trusted adult/); }
    expect(screenMessage("I don't want to be alive").ok).toBe(false);
  });
  it("catches bullying and abuse", () => {
    expect(screenMessage("kids at school keep bullying me")).toMatchObject({ ok: false, category: "bullying" });
    expect(screenMessage("everyone laughs at me")).toMatchObject({ ok: false, category: "bullying" });
    expect(screenMessage("my uncle hits me when he is angry")).toMatchObject({ ok: false, category: "abuse" });
  });
  it("catches personal contact details", () => {
    expect(screenMessage("call me on 050 123 4567")).toMatchObject({ ok: false, category: "contact_details" });
    expect(screenMessage("my email is layla.h@mail.example")).toMatchObject({ ok: false, category: "contact_details" });
    expect(screenMessage("my snapchat is layla123")).toMatchObject({ ok: false, category: "contact_details" });
  });
});

describe("Nova offline replies and prompt", () => {
  it("gives a hint, not an answer, based on keywords", () => {
    expect(offlineReply("How do I find equal fractions?")).toMatch(/^Hint 1/);
    expect(offlineReply("Check my answer: 2/3 = 4/6")).toMatch(/check it together/);
    expect(offlineReply("water cycle please")).toMatch(/evaporation/);
    expect(offlineReply("tell me about volcanoes")).toMatch(/small steps/);
  });
  it("builds an age-appropriate, Socratic prompt", () => {
    const p = novaSystemPrompt({ gradeLevel: 5, firstName: "Layla", subjects: ["Mathematics"] });
    expect(p).toContain("Grade 5");
    expect(p).toMatch(/Never just hand over the answer/);
    expect(p).toMatch(/trusted adult/);
    expect(p).toMatch(/Stay on school learning topics/);
    expect(novaSystemPrompt({ gradeLevel: 0, firstName: "Adam", subjects: [] })).toMatch(/KG2.*\n[\s\S]*very short sentences/);
  });
});

describe("growth (SEL) helpers", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ studentId: `s${i}`, mood: (i % 5) + 1, feelings: i % 2 ? ["Calm"] : ["Tired", "Calm"] }));
  it("hides class summaries for groups under five", () => {
    expect(aggregateCheckins(rows(4))).toBeNull();
    // Several check-ins from the same four students still don't make a group of five.
    expect(aggregateCheckins([...rows(4), ...rows(4)])).toBeNull();
  });
  it("summarises five or more students anonymously", () => {
    const a = aggregateCheckins(rows(6))!;
    expect(a.students).toBe(6);
    expect(a.moodCounts).toEqual([2, 1, 1, 1, 1]);
    expect(a.topFeelings[0]).toEqual({ feeling: "Calm", count: 6 });
    expect(JSON.stringify(a)).not.toContain("s1");
  });
  it("ignores reflection-only rows (mood 0)", () => {
    expect(aggregateCheckins([...rows(4), { studentId: "x", mood: 0, feelings: [] }])).toBeNull();
  });
  it("offers care for low moods or feelings", () => {
    expect(needsCare(2, [])).toBe(true);
    expect(needsCare(4, ["Worried"])).toBe(true);
    expect(needsCare(4, ["Proud"])).toBe(false);
  });
  it("reads habits from prefs defensively", () => {
    expect(readHabits({ habits: { planner: true, breaks: "yes" } })).toEqual({ planner: true, early_homework: false, pack_bag: false, breaks: false });
    expect(readHabits(null).planner).toBe(false);
  });
});

describe("learning streak", () => {
  const now = new Date("2026-10-20T08:00:00Z"); // 12:00 in Dubai
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  it("counts consecutive days ending today", () => {
    expect(learningStreak([daysAgo(0), daysAgo(1), daysAgo(2), daysAgo(4)], now).current).toBe(3);
  });
  it("doesn't break before today's activity", () => {
    const s = learningStreak([daysAgo(1), daysAgo(2)], now);
    expect(s.current).toBe(2);
    expect(s.activeToday).toBe(false);
  });
  it("is zero after a missed day", () => {
    expect(learningStreak([daysAgo(2), daysAgo(3)], now).current).toBe(0);
  });
  it("uses Gulf time for day boundaries", () => {
    expect(dayKey(new Date("2026-10-19T21:30:00Z"))).toBe("2026-10-20");
    const strip = recentDays(new Set([dayKey(now)]), 7, now);
    expect(strip).toHaveLength(7);
    expect(strip[6].active).toBe(true);
    expect(strip[0].active).toBe(false);
  });
});
