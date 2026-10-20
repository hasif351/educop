import { describe, expect, it } from "vitest";
import { recommendFromResult } from "@/lib/recommend";

const base = { assignmentTitle: "Fractions quiz", lesson: { id: "l1", title: "Equivalent fractions" }, maxScore: 10 };

describe("recommendation rules", () => {
  it("suggests reviewing the lesson below 60%", () => {
    const r = recommendFromResult({ ...base, finalScore: 4 });
    expect(r?.kind).toBe("REVIEW");
    expect(r?.lessonId).toBe("l1");
    expect(r?.status).toBe("ACTIVE");
    expect(r?.evidence[0]).toContain("4/10");
  });
  it("suggests practice between 60% and 85%", () => {
    expect(recommendFromResult({ ...base, finalScore: 7 })?.kind).toBe("PRACTICE");
  });
  it("suggests nothing between 85% and 90%", () => {
    expect(recommendFromResult({ ...base, finalScore: 8.7 })).toBeNull();
  });
  it("holds stretch work for teacher review at 90%+", () => {
    const r = recommendFromResult({ ...base, finalScore: 9 });
    expect(r?.kind).toBe("CHALLENGE");
    expect(r?.status).toBe("PENDING_REVIEW");
  });
  it("ignores empty assignments", () => {
    expect(recommendFromResult({ ...base, maxScore: 0, finalScore: 0 })).toBeNull();
  });
});
