import { describe, expect, it } from "vitest";
import { applyLatePenalty, autoScore, daysLate, lateCheck, percent, scoreSubmission } from "@/lib/grading";

const mcq = { id: "q1", type: "MCQ" as const, answerIndex: 2, points: 2 };
const short = { id: "q2", type: "SHORT" as const, answerIndex: null, points: 3 };

describe("grading", () => {
  it("auto-marks multiple choice only", () => {
    expect(autoScore(mcq, 2)).toBe(2);
    expect(autoScore(mcq, 1)).toBe(0);
    expect(autoScore(mcq, null)).toBe(0);
    expect(autoScore(short, 0)).toBeNull();
  });

  it("stays ungraded until every short answer has a teacher score", () => {
    expect(scoreSubmission([mcq, short], [{ questionId: "q1", choiceIndex: 2 }])).toEqual({ raw: 2, max: 5, fullyGraded: false });
    expect(scoreSubmission([mcq, short], [{ questionId: "q1", choiceIndex: 2 }, { questionId: "q2", teacherScore: 2.5 }])).toEqual({ raw: 4.5, max: 5, fullyGraded: true });
  });

  it("clamps teacher scores to the question's points", () => {
    expect(scoreSubmission([short], [{ questionId: "q2", teacherScore: 99 }]).raw).toBe(3);
    expect(scoreSubmission([short], [{ questionId: "q2", teacherScore: -1 }]).raw).toBe(0);
  });

  it("counts days late by started day", () => {
    const due = new Date("2026-10-20T11:00:00Z");
    expect(daysLate(due, new Date("2026-10-20T10:59:00Z"))).toBe(0);
    expect(daysLate(due, new Date("2026-10-20T11:01:00Z"))).toBe(1);
    expect(daysLate(due, new Date("2026-10-22T12:00:00Z"))).toBe(3);
  });

  it("applies the late policy", () => {
    const policy = { latePenaltyPerDay: 10, maxLateDays: 3 };
    expect(applyLatePenalty(10, policy, 2)).toBe(8);
    expect(lateCheck(policy, 3).accepted).toBe(true);
    expect(lateCheck(policy, 4).accepted).toBe(false);
    expect(lateCheck({ latePenaltyPerDay: null, maxLateDays: 3 }, 1).accepted).toBe(false);
    expect(applyLatePenalty(10, { latePenaltyPerDay: 0, maxLateDays: 3 }, 2)).toBe(10);
    expect(applyLatePenalty(10, { latePenaltyPerDay: 60, maxLateDays: 3 }, 2)).toBe(0);
  });

  it("computes percentages safely", () => {
    expect(percent(4, 10)).toBe(40);
    expect(percent(null, 10)).toBeNull();
    expect(percent(3, 0)).toBeNull();
  });
});
