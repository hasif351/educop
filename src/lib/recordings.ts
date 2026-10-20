import { z } from "zod";

// Pure helpers for recorded classes: video link checks, watched-range maths,
// captions (WebVTT) parsing and conversion, and aggregate analytics.
// No database access, so they're safe to import from client components and tests.

export type Range = [number, number];
export type Chapter = { t: number; title: string };
export type VideoQuestion = { id: string; t: number; prompt: string; options: string[]; answerIndex: number; explanation: string };
/** What a student's browser gets: no answer key or explanation until they answer. */
export type StudentQuestion = Omit<VideoQuestion, "answerIndex" | "explanation">;
export type AnswerRecord = { choice: number; correct: boolean; attempts: number };
export type Cue = { start: number; end: number; text: string };

/** Watched at least this share of the video (and answered every question) = completed. */
export const COMPLETE_PCT = 90;
export const RECORDING_POINTS = 15;
export const MAX_DURATION_SEC = 6 * 3600;

// ---------------- Video links ----------------

const VIDEO_EXT = /\.(mp4|webm|mov)$/i;
const BLOB_HOST = /\.public\.blob\.vercel-storage\.com$/i;
const PAGE_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|teams\.microsoft\.com|teams\.live\.com|sharepoint\.com|onedrive\.live\.com|1drv\.ms|drive\.google\.com|meet\.google\.com|docs\.google\.com|stream\.microsoft\.com)$/i;

export type VideoSource = "upload" | "link" | "demo";

/** True for a file uploaded to this app's Vercel Blob store. */
export function isBlobUrl(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && BLOB_HOST.test(u.hostname);
  } catch { return false; }
}

/**
 * Checks a video address. Accepts an https link straight to a video file
 * (.mp4, .webm, .mov), a file in our Vercel Blob store, or a demo file the app
 * serves itself under /media/. Video pages (YouTube, Teams, Drive) aren't files
 * a browser can play, so they get a specific message.
 */
export function parseVideoUrl(raw: string): { url: string; source: VideoSource } | { error: string } {
  const v = raw.trim();
  if (!v) return { error: "Add a video: upload a file or paste a link to one." };
  if (v.length > 2000) return { error: "That link is too long." };
  if (v.startsWith("/")) {
    // Same-origin demo files only, no path tricks.
    if (/^\/media\/[a-z0-9][a-z0-9._-]*\.(mp4|webm|mov)$/i.test(v) && !v.includes("..")) return { url: v, source: "demo" };
    return { error: "Paste a full https:// link to a video file." };
  }
  let u: URL;
  try { u = new URL(v); } catch { return { error: "That doesn't look like a link. Paste a full https:// address." }; }
  if (u.protocol !== "https:") return { error: "Video links must start with https://." };
  if (u.username || u.password) return { error: "Links with a user name or password aren't allowed." };
  const host = u.hostname.toLowerCase();
  if (PAGE_HOSTS.test(host)) {
    return { error: "That's a video page, not a video file, so it can't play here. Download the recording (for Teams or Meet, from the meeting chat or your Drive/OneDrive) and upload it, or paste a direct .mp4 link." };
  }
  if (BLOB_HOST.test(host)) return { url: u.toString(), source: "upload" };
  if (!VIDEO_EXT.test(u.pathname)) return { error: "The link must point straight to a video file ending in .mp4, .webm or .mov." };
  return { url: u.toString(), source: "link" };
}

/**
 * The files to offer the browser, best first. The app's own demo videos ship as
 * .mp4 (H.264, plays everywhere) with a .webm twin for browsers without H.264,
 * such as open-source Chromium.
 */
export function videoSources(url: string): { src: string; type?: string }[] {
  if (/^\/media\/[\w.-]+\.mp4$/i.test(url)) return [{ src: url, type: "video/mp4" }, { src: url.replace(/\.mp4$/i, ".webm"), type: "video/webm" }];
  // No type for other links: browsers often play .mov files they'd skip if labelled video/quicktime.
  return [{ src: url }];
}

// ---------------- Time stamps ----------------

/** "83", "1:23", "01:02:03", "1:23.5" -> seconds. Null if it isn't a time. */
export function parseTimestamp(raw: string): number | null {
  const v = raw.trim();
  if (!/^\d+(:\d{1,2}){0,2}([.,]\d{1,3})?$/.test(v)) return null;
  const [main, frac] = v.split(/[.,]/);
  const parts = main.split(":").map(Number);
  if (parts.slice(1).some((p) => p > 59)) return null;
  const secs = parts.reduce((acc, p) => acc * 60 + p, 0);
  return secs + (frac ? Number(`0.${frac}`) : 0);
}

/** 83 -> "1:23", 3723 -> "1:02:03". */
export function fmtClock(sec: number) {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Spoken form for aria-valuetext: "1 minute 23 seconds". */
export function spokenClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return [h && part(h, "hour"), m && part(m, "minute"), (r || (!h && !m)) && part(r, "second")].filter(Boolean).join(" ");
}

const vttTime = (sec: number) => {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
};

// ---------------- Watched ranges ----------------

/** Sorts, clamps and merges ranges; touching or overlapping ranges (within 1 s) become one. */
export function mergeRanges(ranges: Range[], durationSec?: number | null): Range[] {
  const max = durationSec && durationSec > 0 ? durationSec : Infinity;
  const clean = ranges
    .filter((r) => Array.isArray(r) && r.length === 2 && Number.isFinite(r[0]) && Number.isFinite(r[1]))
    .map(([a, b]) => [Math.max(0, Math.min(a, b, max)), Math.min(Math.max(a, b), max)] as Range)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const out: Range[] = [];
  for (const [a, b] of clean) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out.map(([a, b]) => [Math.round(a * 10) / 10, Math.round(b * 10) / 10]);
}

export function watchedSeconds(ranges: Range[]) {
  return ranges.reduce((t, [a, b]) => t + (b - a), 0);
}

/** Percent of the video covered by unique watched seconds. */
export function watchedPercent(ranges: Range[], durationSec: number | null | undefined) {
  if (!durationSec || durationSec <= 0) return 0;
  return Math.min(100, Math.round((watchedSeconds(mergeRanges(ranges, durationSec)) / durationSec) * 100));
}

/**
 * Adds newly reported ranges to the saved ones, counting at most `allowanceSec`
 * of new watching (roughly the wall time since the last save at 2x speed), so a
 * hand-made request can't mark a whole video as watched in one go.
 */
export function addWatched(prev: Range[], incoming: Range[], durationSec: number | null | undefined, allowanceSec: number): Range[] {
  const base = mergeRanges(prev, durationSec);
  let budget = Math.max(0, allowanceSec);
  let out = base;
  for (const r of mergeRanges(incoming, durationSec)) {
    if (budget <= 0) break;
    const before = watchedSeconds(out);
    const trial = mergeRanges([...out, r], durationSec);
    const gained = watchedSeconds(trial) - before;
    if (gained <= budget) { out = trial; budget -= gained; continue; }
    // Too much at once: keep the start of this range, up to the budget.
    out = mergeRanges([...out, [r[0], r[0] + budget]], durationSec);
    budget = 0;
  }
  return out;
}

/** Reads a stored watched value defensively. */
export function readRanges(v: unknown): Range[] {
  if (!Array.isArray(v)) return [];
  return v.filter((r): r is Range => Array.isArray(r) && r.length === 2 && typeof r[0] === "number" && typeof r[1] === "number");
}

export function readAnswers(v: unknown): Record<string, AnswerRecord> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, AnswerRecord> = {};
  for (const [k, a] of Object.entries(v as Record<string, unknown>)) {
    if (a && typeof a === "object" && typeof (a as AnswerRecord).choice === "number") {
      const r = a as AnswerRecord;
      out[k] = { choice: r.choice, correct: r.correct === true, attempts: Number(r.attempts) || 1 };
    }
  }
  return out;
}

export function isComplete(watchedPct: number, questions: { id: string }[], answers: Record<string, AnswerRecord>) {
  return watchedPct >= COMPLETE_PCT && questions.every((q) => answers[q.id]);
}

/** The first unanswered question before `target`, which a student must answer before seeking past it. */
export function blockingQuestion<Q extends { id: string; t: number }>(questions: Q[], answered: (id: string) => boolean, target: number): Q | null {
  return [...questions].sort((a, b) => a.t - b.t).find((q) => q.t < target && !answered(q.id)) ?? null;
}

// ---------------- Chapters and questions ----------------

export const ChapterSchema = z.object({ t: z.number().min(0).max(MAX_DURATION_SEC), title: z.string().trim().min(1).max(120) });
export const QuestionSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{4,24}$/i),
  t: z.number().min(0).max(MAX_DURATION_SEC),
  prompt: z.string().trim().min(1).max(500),
  options: z.array(z.string().trim().min(1).max(200)).min(2).max(6),
  answerIndex: z.number().int().min(0),
  explanation: z.string().trim().max(500).default(""),
}).refine((q) => q.answerIndex < q.options.length, "Each question needs a correct answer.");

export function readChapters(v: unknown): Chapter[] {
  const r = z.array(ChapterSchema).safeParse(v);
  return r.success ? [...r.data].sort((a, b) => a.t - b.t) : [];
}
export function readQuestions(v: unknown): VideoQuestion[] {
  const r = z.array(QuestionSchema).safeParse(v);
  return r.success ? [...r.data].sort((a, b) => a.t - b.t) : [];
}
export const forStudent = (qs: VideoQuestion[]): StudentQuestion[] => qs.map(({ id, t, prompt, options }) => ({ id, t, prompt, options }));

// ---------------- Captions ----------------

const CUE_LINE = /^((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/;

/** Cues from WebVTT text, for the transcript. Ignores notes, styles and cue settings. */
export function parseVtt(vtt: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = vtt.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const i = lines.findIndex((l) => CUE_LINE.test(l.trim()));
    if (i < 0) continue;
    const m = lines[i].trim().match(CUE_LINE)!;
    const start = parseTimestamp(m[1]), end = parseTimestamp(m[2]);
    const text = lines.slice(i + 1).join("\n").replace(/<[^>]+>/g, "").trim();
    if (start == null || end == null || end <= start || !text) continue;
    cues.push({ start, end, text });
  }
  return cues.sort((a, b) => a.start - b.start);
}

/**
 * Turns what a teacher pastes into WebVTT. Either real WebVTT (checked and kept
 * as cues), or plain lines like "00:12 Today we look at…": each line shows
 * until the next one starts (at most 8 s).
 */
export function toVtt(raw: string): { vtt: string | null } | { error: string } {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  if (!text) return { vtt: null };
  if (text.length > 100_000) return { error: "Captions are too long (100,000 characters at most)." };
  let cues: Cue[];
  if (/^WEBVTT/.test(text)) {
    cues = parseVtt(text);
    if (!cues.length) return { error: "No captions found in that WebVTT text. Each cue needs a line like 00:00:01.000 --> 00:00:04.000 and some text." };
  } else {
    const rows: { t: number; text: string }[] = [];
    for (const [n, line] of text.split("\n").entries()) {
      if (!line.trim()) continue;
      const m = line.trim().match(/^\[?(\d+(?::\d{1,2}){1,2}(?:[.,]\d{1,3})?)\]?\s*[-–:]?\s+(.+)$/);
      const t = m ? parseTimestamp(m[1]) : null;
      if (!m || t == null) return { error: `Captions line ${n + 1} needs a time first, like "00:12 Today we look at fractions".` };
      rows.push({ t, text: m[2].trim() });
    }
    rows.sort((a, b) => a.t - b.t);
    cues = rows.map((r, i) => ({ start: r.t, end: Math.min(rows[i + 1]?.t ?? Infinity, r.t + 8), text: r.text }))
      .map((c) => (c.end > c.start ? c : { ...c, end: c.start + 1 }));
  }
  const body = cues.map((c) => `${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.text.replace(/-->/g, "→")}`).join("\n\n");
  return { vtt: `WEBVTT\n\n${body}\n` };
}

// ---------------- Analytics (aggregate only) ----------------

/** Share of viewers (0-100) who watched each slice of the timeline. */
export function dropOff(views: Range[][], durationSec: number | null | undefined, buckets = 20): number[] {
  if (!durationSec || durationSec <= 0 || views.length === 0) return Array(buckets).fill(0);
  const size = durationSec / buckets;
  return Array.from({ length: buckets }, (_, b) => {
    const from = b * size, to = from + size;
    const seen = views.filter((ranges) => ranges.some(([a, e]) => Math.min(e, to) - Math.max(a, from) >= size / 2)).length;
    return Math.round((seen / views.length) * 100);
  });
}

/** Per question: how many students answered and what share got it right. */
export function questionStats(questions: { id: string }[], answers: Record<string, AnswerRecord>[]) {
  return questions.map((q) => {
    const got = answers.map((a) => a[q.id]).filter(Boolean);
    const correct = got.filter((a) => a.correct).length;
    return { id: q.id, answered: got.length, correct, pct: got.length ? Math.round((correct / got.length) * 100) : null };
  });
}

/** A short random id for a new in-video question. */
export function newQuestionId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
}
