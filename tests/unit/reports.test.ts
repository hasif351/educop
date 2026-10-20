import { describe, expect, it } from "vitest";
import { attentionReasons, classReport, subjectReports, type ReportClass } from "@/lib/reports";
import { doneKeys, homeActivities, toggleDone } from "@/lib/home-learning";

const now = new Date("2026-10-20T10:00:00Z");
const past = new Date("2026-10-18T10:00:00Z");
const future = new Date("2026-10-25T10:00:00Z");
const sub = (status: "SUBMITTED" | "GRADED" | "IN_PROGRESS", finalScore: number | null, maxScore: number | null, daysLate = 0) => ({ status, finalScore, maxScore, daysLate });

const maths: ReportClass = {
  id: "c1", name: "5B Maths", subject: "Mathematics", teacher: "T", students: 4,
  assignments: [
    { dueAt: past, submissions: [sub("GRADED", 8, 10), sub("GRADED", 4, 10, 1), sub("SUBMITTED", null, null), sub("IN_PROGRESS", null, null)] },
    { dueAt: future, submissions: [sub("GRADED", 10, 10)] },
  ],
};

describe("classReport", () => {
  it("averages marked work and counts completion only for due work", () => {
    const r = classReport(maths, now);
    expect(r.avgPct).toBe(73); // 22/30
    expect(r.completionPct).toBe(75); // 3 of 4 handed in for the due assignment
    expect(r.missing).toBe(1);
    expect(r.late).toBe(1);
    expect(r.graded).toBe(3);
  });
  it("returns nulls when there is nothing to measure", () => {
    const r = classReport({ ...maths, assignments: [] }, now);
    expect(r.avgPct).toBeNull();
    expect(r.completionPct).toBeNull();
    expect(attentionReasons(r)).toEqual(["No assignments set yet"]);
  });
});

describe("subjectReports", () => {
  it("rolls classes up by subject", () => {
    const sci: ReportClass = { ...maths, id: "c2", subject: "Science", assignments: [{ dueAt: past, submissions: [sub("GRADED", 2, 10)] }] };
    const rs = subjectReports([maths, { ...maths, id: "c3" }, sci], now);
    expect(rs.map((r) => r.subject)).toEqual(["Mathematics", "Science"]);
    expect(rs[0]).toMatchObject({ classes: 2, students: 8, avgPct: 73, completionPct: 75 });
    expect(rs[1]).toMatchObject({ avgPct: 20, completionPct: 25, missing: 3 });
  });
});

describe("attentionReasons", () => {
  it("explains why a class is flagged", () => {
    const r = { ...classReport(maths, now), avgPct: 50, completionPct: 60, late: 4 };
    expect(attentionReasons(r)).toEqual(["Average score 50%", "60% of due work handed in", "4 late submissions"]);
  });
});

describe("home learning", () => {
  it("builds activities from suggestions and lessons", () => {
    const acts = homeActivities(
      [{ id: "r1", kind: "REVIEW", title: "Review: Comparing fractions", lessonTitle: "Comparing fractions" }],
      [{ id: "l1", title: "Equivalent fractions", subject: "Mathematics", worksheet: "1) 1/3 = ?/9\n2) 2/7 = 4/?\n3) more", nextActivity: "Complete the check-in.", scheduledFor: now }],
    );
    expect(acts.map((a) => a.key)).toEqual(["rec:r1", "lesson:l1:ws", "lesson:l1:ask"]);
    expect(acts[1].body).toContain("1) 1/3 = ?/9 · 2) 2/7 = 4/?");
    expect(acts[1].body).not.toContain("more");
  });
  it("toggles done keys and keeps other prefs", () => {
    const p1 = toggleDone({ bigText: true }, "rec:r1", true, now);
    expect(p1).toMatchObject({ bigText: true, homeLearningDone: { "rec:r1": now.toISOString() } });
    expect(doneKeys(toggleDone(p1, "rec:r1", false))).toEqual({});
    expect(doneKeys(null)).toEqual({});
    expect(doneKeys({ homeLearningDone: { a: 1 } })).toEqual({});
  });
});
