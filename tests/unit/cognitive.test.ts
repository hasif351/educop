import { describe, expect, it } from "vitest";
import {
  ARROWS, DOMAINS, adapt, bandFor, generateItem, growthMessage, itemsPerSet, replaySession, scoreItems, startLevel,
} from "@/lib/cognitive";

describe("item generation", () => {
  it("is deterministic for the same seed, index and level", () => {
    for (const d of DOMAINS) {
      expect(generateItem(d, 5, "seed-1", 3, 2)).toEqual(generateItem(d, 5, "seed-1", 3, 2));
    }
  });
  it("changes with the seed", () => {
    const a = DOMAINS.map((d) => JSON.stringify(generateItem(d, 5, "seed-a", 0, 3)));
    const b = DOMAINS.map((d) => JSON.stringify(generateItem(d, 5, "seed-b", 0, 3)));
    expect(a).not.toEqual(b);
  });
  it("always has four distinct options with the answer among them", () => {
    for (const d of DOMAINS) for (const grade of [0, 2, 5, 8, 11]) for (let lv = 1; lv <= 5; lv++) for (let i = 0; i < 8; i++) {
      const it = generateItem(d, grade, `s${i}`, i, lv);
      expect(it.options).toHaveLength(4);
      expect(new Set(it.options).size).toBe(4);
      expect(it.answerIndex).toBeGreaterThanOrEqual(0);
      expect(it.answerIndex).toBeLessThan(4);
    }
  });
  it("number patterns have the right next term", () => {
    for (let i = 0; i < 30; i++) {
      const it = generateItem("patterns", 5, `p${i}`, i, 2); // primary band, level 2: +k sequences
      const nums = it.figure!.slice(0, -1).map(Number);
      const step = nums[1] - nums[0];
      expect(nums[2] - nums[1]).toBe(step);
      expect(Number(it.options[it.answerIndex])).toBe(nums[3] + step);
    }
  });
  it("memory lists get longer with level and age", () => {
    expect(generateItem("memory", 1, "m", 0, 1).memo!.length).toBeLessThan(generateItem("memory", 1, "m", 0, 5).memo!.length);
    expect(generateItem("memory", 1, "m", 0, 3).memo!.length).toBeLessThanOrEqual(generateItem("memory", 10, "m", 0, 3).memo!.length);
  });
  it("memory answers are consistent with the list", () => {
    for (let i = 0; i < 20; i++) {
      const it = generateItem("memory", 5, `m${i}`, i, 1);
      expect(it.memo).not.toContain(it.options[it.answerIndex]);
      const pos = generateItem("memory", 5, `m${i}`, i, 3);
      const k = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"].findIndex((w) => pos.prompt.includes(` ${w} `));
      expect(pos.memo![k]).toBe(pos.options[pos.answerIndex]);
    }
  });
  it("spatial items use arrows and give screen-reader labels", () => {
    const it = generateItem("spatial", 5, "x", 0, 1);
    expect(it.options.every((o) => ARROWS.includes(o))).toBe(true);
    expect(it.optionLabels?.[0]).toMatch(/^Arrow pointing/);
    // Level 1 for a Grade 5 student turns 90° clockwise each step.
    const idx = it.figure!.slice(0, -1).map((a) => ARROWS.indexOf(a));
    expect(ARROWS.indexOf(it.options[it.answerIndex])).toBe((idx[2] + 2) % 8);
  });
  it("uses age bands from the grade level", () => {
    expect(bandFor(-1)).toBe("early");
    expect(bandFor(2)).toBe("early");
    expect(bandFor(5)).toBe("primary");
    expect(bandFor(7)).toBe("middle");
    expect(bandFor(12)).toBe("senior");
    expect(bandFor(null)).toBe("primary");
    expect(itemsPerSet("early")).toBe(6);
    // Young children get colour patterns, older students number rules.
    expect(generateItem("patterns", 0, "y", 0, 1).figure![0]).toMatch(/\p{Emoji}/u);
    expect(generateItem("patterns", 9, "y", 0, 1).prompt).toContain("number");
  });
});

describe("adaptive level", () => {
  it("goes up after two right answers and down after two wrong", () => {
    let s = { level: 2, run: 0 };
    s = adapt(s, true); expect(s.level).toBe(2);
    s = adapt(s, true); expect(s).toEqual({ level: 3, run: 0 });
    s = adapt(s, false); s = adapt(s, false); expect(s.level).toBe(2);
  });
  it("a mixed answer resets the run", () => {
    let s = { level: 2, run: 0 };
    s = adapt(s, true); s = adapt(s, false); s = adapt(s, true);
    expect(s.level).toBe(2);
  });
  it("stays between 1 and 5", () => {
    expect(adapt(adapt({ level: 5, run: 0 }, true), true).level).toBe(5);
    expect(adapt(adapt({ level: 1, run: 0 }, false), false).level).toBe(1);
  });
  it("starts where the last set ended", () => {
    expect(startLevel(null)).toBe(1);
    expect(startLevel({ level: 4 })).toBe(4);
    expect(startLevel({ level: 9 })).toBe(5);
  });
});

describe("scoring", () => {
  it("replays a session from the seed and the student's choices", () => {
    const seed = "replay";
    // Answer every item correctly by looking at the generated item for the current level.
    const answers = [];
    let level = 1, run = 0;
    for (let i = 0; i < 8; i++) {
      const it = generateItem("patterns", 5, seed, i, level);
      answers.push({ choice: it.answerIndex, ms: 4000 });
      ({ level, run } = adapt({ level, run }, true));
    }
    const r = replaySession("patterns", 5, seed, 1, answers);
    expect(r.correct).toBe(8);
    expect(r.total).toBe(8);
    expect(r.avgMs).toBe(4000);
    expect(r.endLevel).toBe(5);
    expect(r.items[2].level).toBe(2);
  });
  it("ignores extra answers beyond the set size and clamps times", () => {
    const answers = Array.from({ length: 20 }, () => ({ choice: 0, ms: 9e9 }));
    const r = replaySession("speed", 1, "x", 1, answers);
    expect(r.total).toBe(6);
    expect(r.items.every((i) => i.ms <= 600_000)).toBe(true);
  });
  it("counts skipped items as not correct and leaves them out of the average time", () => {
    expect(scoreItems([{ correct: true, ms: 1000, choice: 1 }, { correct: false, ms: 0, choice: null }])).toEqual({ correct: 1, total: 2, avgMs: 1000 });
  });
});

describe("growth messages", () => {
  const s = (correct: number, level = 2, avgMs = 5000) => ({ correct, total: 8, level, avgMs });
  it("welcomes a first try", () => {
    expect(growthMessage("patterns", []).tone).toBe("new");
    expect(growthMessage("patterns", [s(5)]).text).toContain("Great start");
  });
  it("notices faster speed practice", () => {
    expect(growthMessage("speed", [s(6, 2, 6000), s(6, 2, 6000), s(6, 2, 4000), s(7, 2, 3800)]).text).toBe("You're getting quicker at quick puzzles.");
  });
  it("notices harder levels and more puzzles solved", () => {
    expect(growthMessage("memory", [s(5, 1), s(5, 2), s(5, 3), s(5, 4)]).text).toContain("harder memory puzzles");
    expect(growthMessage("verbal", [s(3), s(4), s(6), s(7)]).text).toContain("solving more word puzzles");
  });
  it("never talks about IQ, percentiles or other students", () => {
    const texts = DOMAINS.flatMap((d) => [growthMessage(d, []), growthMessage(d, [s(4), s(4)]), growthMessage(d, [s(2), s(7)])].map((m) => m.text));
    for (const t of texts) expect(t).not.toMatch(/IQ|percentile|other students|class average|rank/i);
  });
});
