import { describe, expect, it } from "vitest";
import {
  addWatched, blockingQuestion, dropOff, fmtClock, forStudent, isComplete, mergeRanges, newQuestionId, parseTimestamp,
  parseVideoUrl, parseVtt, questionStats, readAnswers, readQuestions, readRanges, spokenClock, toVtt, videoSources, watchedPercent,
} from "@/lib/recordings";

describe("video links", () => {
  it("accepts https video files, blob uploads and demo files", () => {
    expect(parseVideoUrl("https://cdn.example.org/lessons/fractions.mp4")).toEqual({ url: "https://cdn.example.org/lessons/fractions.mp4", source: "link" });
    expect(parseVideoUrl(" https://cdn.example.org/a.WEBM?x=1 ")).toMatchObject({ source: "link" });
    expect(parseVideoUrl("https://cdn.example.org/a.mov")).toMatchObject({ source: "link" });
    expect(parseVideoUrl("https://abc123.public.blob.vercel-storage.com/recordings/class-x1Y2.mp4")).toMatchObject({ source: "upload" });
    expect(parseVideoUrl("/media/equivalent-fractions.mp4")).toEqual({ url: "/media/equivalent-fractions.mp4", source: "demo" });
  });

  it("rejects other links with a helpful message", () => {
    const err = (v: string) => ("error" in parseVideoUrl(v) ? (parseVideoUrl(v) as { error: string }).error : null);
    expect(err("http://cdn.example.org/a.mp4")).toMatch(/https/);
    expect(err("https://cdn.example.org/page.html")).toMatch(/\.mp4/);
    expect(err("https://www.youtube.com/watch?v=abc")).toMatch(/video page/);
    expect(err("https://teams.microsoft.com/l/meetup-join/xyz.mp4")).toMatch(/video page/);
    expect(err("https://drive.google.com/file/d/1/view")).toMatch(/video page/);
    expect(err("https://user:pw@cdn.example.org/a.mp4")).toMatch(/password/);
    expect(err("javascript:alert(1)")).toBeTruthy();
    expect(err("/media/../secret.mp4")).toBeTruthy();
    expect(err("/api/thing.mp4")).toBeTruthy();
    expect(err("")).toMatch(/Add a video/);
  });
});

describe("time stamps", () => {
  it("parses and formats", () => {
    expect(parseTimestamp("83")).toBe(83);
    expect(parseTimestamp("1:23")).toBe(83);
    expect(parseTimestamp("01:02:03")).toBe(3723);
    expect(parseTimestamp("00:00:01.500")).toBe(1.5);
    expect(parseTimestamp("1:75")).toBeNull();
    expect(parseTimestamp("abc")).toBeNull();
    expect(fmtClock(83)).toBe("1:23");
    expect(fmtClock(3723)).toBe("1:02:03");
    expect(fmtClock(NaN)).toBe("0:00");
    expect(spokenClock(83)).toBe("1 minute 23 seconds");
    expect(spokenClock(0)).toBe("0 seconds");
  });
});

describe("watched ranges", () => {
  it("merges overlapping and touching ranges and clamps to the duration", () => {
    expect(mergeRanges([[10, 20], [0, 5], [15, 30], [30.5, 40]])).toEqual([[0, 5], [10, 40]]);
    expect(mergeRanges([[50, 80], [-5, 2]], 60)).toEqual([[0, 2], [50, 60]]);
    expect(mergeRanges([[5, 5], [8, 3]])).toEqual([[3, 8]]);
  });

  it("counts unique seconds, so skipping and rewatching don't inflate the percent", () => {
    expect(watchedPercent([[0, 30], [0, 30], [10, 20]], 100)).toBe(30);
    expect(watchedPercent([[0, 10], [90, 100]], 100)).toBe(20);
    expect(watchedPercent([[0, 10]], 0)).toBe(0);
    expect(watchedPercent([[0, 500]], 100)).toBe(100);
  });

  it("limits how much new watching one save can add", () => {
    expect(addWatched([[0, 10]], [[10, 20]], 100, 30)).toEqual([[0, 20]]);
    expect(addWatched([[0, 10]], [[0, 100]], 100, 15)).toEqual([[0, 15]]);
    // Rewatching already-counted seconds costs nothing.
    expect(addWatched([[0, 50]], [[0, 50], [60, 65]], 100, 5)).toEqual([[0, 50], [60, 65]]);
    expect(addWatched([], [[0, 10]], 100, 0)).toEqual([]);
  });

  it("reads stored values defensively", () => {
    expect(readRanges([[1, 2], ["x", 3], [4]])).toEqual([[1, 2]]);
    expect(readRanges(null)).toEqual([]);
    expect(readAnswers({ q1: { choice: 1, correct: true, attempts: 2 }, q2: "bad" })).toEqual({ q1: { choice: 1, correct: true, attempts: 2 } });
  });
});

describe("completion and questions", () => {
  const qs = [{ id: "qa", t: 30 }, { id: "qb", t: 10 }];
  it("needs 90% watched and every question answered", () => {
    expect(isComplete(95, qs, { qa: { choice: 0, correct: false, attempts: 1 }, qb: { choice: 1, correct: true, attempts: 1 } })).toBe(true);
    expect(isComplete(89, [], {})).toBe(false);
    expect(isComplete(100, qs, { qa: { choice: 0, correct: true, attempts: 1 } })).toBe(false);
  });

  it("finds the first unanswered question before a seek target", () => {
    expect(blockingQuestion(qs, () => false, 50)?.id).toBe("qb");
    expect(blockingQuestion(qs, (id) => id === "qb", 50)?.id).toBe("qa");
    expect(blockingQuestion(qs, () => false, 5)).toBeNull();
    expect(blockingQuestion(qs, () => false, 10)).toBeNull();
  });

  it("validates questions and hides answers from students", () => {
    const q = { id: "abcd12", t: 12, prompt: "1/2 = ?", options: ["2/4", "1/3"], answerIndex: 0, explanation: "Double both." };
    expect(readQuestions([q, { ...q, id: "x" }])).toEqual([]);
    expect(readQuestions([q])).toHaveLength(1);
    expect(readQuestions([{ ...q, answerIndex: 5 }])).toEqual([]);
    expect(forStudent([q])[0]).toEqual({ id: "abcd12", t: 12, prompt: "1/2 = ?", options: ["2/4", "1/3"] });
    expect(newQuestionId()).toMatch(/^[a-z0-9]{4,24}$/);
  });
});

describe("captions", () => {
  it("converts plain timed lines to WebVTT", () => {
    const r = toVtt("00:00 Hello class\n0:05 Today: fractions\n\n1:00:01 The end");
    expect("vtt" in r && r.vtt).toBe(
      "WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nHello class\n\n00:00:05.000 --> 00:00:13.000\nToday: fractions\n\n01:00:01.000 --> 01:00:09.000\nThe end\n",
    );
    expect(toVtt("  ")).toEqual({ vtt: null });
    expect(toVtt("Hello without a time")).toEqual({ error: expect.stringMatching(/line 1/) });
  });

  it("keeps real WebVTT cues and parses them for the transcript", () => {
    const vtt = "WEBVTT\n\nNOTE a note\n\n1\n00:00:01.000 --> 00:00:04.000 align:start\n<v Sara>Hello</v> 5B\n\n00:00:04.000 --> 00:00:06.500\nLine two\nmore";
    expect(parseVtt(vtt)).toEqual([{ start: 1, end: 4, text: "Hello 5B" }, { start: 4, end: 6.5, text: "Line two\nmore" }]);
    const r = toVtt(vtt);
    expect("vtt" in r && parseVtt(r.vtt!)).toHaveLength(2);
    expect(toVtt("WEBVTT\n\nnothing here")).toEqual({ error: expect.stringMatching(/No captions/) });
  });
});

describe("analytics", () => {
  it("shows where viewers drop off, in aggregate", () => {
    expect(dropOff([[[0, 100]], [[0, 50]]], 100, 4)).toEqual([100, 100, 50, 50]);
    expect(dropOff([], 100, 2)).toEqual([0, 0]);
  });
  it("summarises question results", () => {
    const a: Record<string, { choice: number; correct: boolean; attempts: number }>[] = [{ q: { choice: 0, correct: true, attempts: 1 } }, { q: { choice: 1, correct: false, attempts: 2 } }, {}];
    expect(questionStats([{ id: "q" }, { id: "z" }], a)).toEqual([
      { id: "q", answered: 2, correct: 1, pct: 50 }, { id: "z", answered: 0, correct: 0, pct: null },
    ]);
  });
});

describe("video sources", () => {
  it("offers the demo's webm twin and leaves other links alone", () => {
    expect(videoSources("/media/equivalent-fractions.mp4")).toEqual([{ src: "/media/equivalent-fractions.mp4", type: "video/mp4" }, { src: "/media/equivalent-fractions.webm", type: "video/webm" }]);
    expect(videoSources("https://cdn.example.org/a.mov")).toEqual([{ src: "https://cdn.example.org/a.mov" }]);
  });
});
