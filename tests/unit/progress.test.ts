import { describe, expect, it } from "vitest";
import { masteryLevel, pooledPct, supportReasons, trend } from "@/lib/progress";

describe("progress rules", () => {
  it("bands mastery", () => {
    expect([null, 0, 49, 50, 69, 70, 89, 90, 100].map((p) => masteryLevel(p))).toEqual([null, 0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it("finds a trend against the earlier average", () => {
    expect(trend([])).toBeNull();
    expect(trend([70])).toBeNull();
    expect(trend([60, 70, 80])).toBe("up");
    expect(trend([80, 80, 60])).toBe("down");
    expect(trend([70, 72, 73])).toBe("steady");
  });

  it("pools scores", () => {
    expect(pooledPct([])).toBeNull();
    expect(pooledPct([{ score: 3, max: 4 }, { score: 1, max: 4 }])).toBe(50);
  });

  it("explains support reasons in plain words", () => {
    expect(supportReasons({ avgPct: 80, missing: 0, activeReview: 0, sharedLowMood: 0 })).toEqual([]);
    expect(supportReasons({ avgPct: 40, missing: 2, activeReview: 1, sharedLowMood: 2 })).toEqual([
      "Average on marked work is 40%", "2 assignments not handed in", "1 review suggestion still open", "Shared a low-mood check-in 2 times recently",
    ]);
  });
});
