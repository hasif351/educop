import { MAX_DURATION_SEC, fmtClock, type Chapter } from "./recordings";

// Pure helpers for the recording studio: chapter marks made while recording,
// carried to the New recording form in the address, and the file name.
// No browser or database access, so they're safe to unit test.

export const MAX_CHAPTERS = 50;
/** Marks closer together than this replace each other (a quick switch back and forth). */
export const CHAPTER_MIN_GAP = 3;

/**
 * Adds a chapter mark at `t` seconds into the recording. A mark within
 * CHAPTER_MIN_GAP seconds of the previous one replaces it, so flicking between
 * views doesn't leave a trail of one-second chapters.
 */
export function addChapter(list: Chapter[], t: number, title: string): Chapter[] {
  const at = Math.max(0, Math.floor(t));
  const clean = title.trim().slice(0, 120) || "Chapter";
  const last = list[list.length - 1];
  if (last && at - last.t < CHAPTER_MIN_GAP) {
    if (last.title === clean) return list;
    // Keep a 0:00 start, so the first chapter always opens the video.
    return [...list.slice(0, -1), { t: last.t === 0 ? 0 : at, title: clean }];
  }
  if (list.length >= MAX_CHAPTERS) return list;
  return [...list, { t: at, title: clean }];
}

/** Compact form for the address bar: [[seconds, "title"], ...]. */
export function encodeChapters(list: Chapter[]) {
  return JSON.stringify(list.slice(0, MAX_CHAPTERS).map((c) => [c.t, c.title]));
}

/**
 * Reads chapters back from the address. Anything malformed is dropped; times
 * past the end are dropped; the list is sorted and always starts at 0:00.
 */
export function decodeChapters(raw: string | undefined, durationSec: number | null): Chapter[] {
  let rows: unknown;
  try { rows = JSON.parse((raw ?? "").slice(0, 10_000)); } catch { rows = null; }
  const max = durationSec ?? MAX_DURATION_SEC;
  const out: Chapter[] = [];
  if (Array.isArray(rows)) {
    for (const r of rows.slice(0, MAX_CHAPTERS)) {
      if (!Array.isArray(r) || typeof r[0] !== "number" || typeof r[1] !== "string") continue;
      const t = Math.floor(r[0]);
      const title = r[1].trim().slice(0, 120);
      if (!Number.isFinite(t) || t < 0 || t >= Math.max(1, max) || !title) continue;
      if (out.some((c) => c.t === t)) continue;
      out.push({ t, title });
    }
  }
  out.sort((a, b) => a.t - b.t);
  if (!out.length || out[0].t !== 0) out.unshift({ t: 0, title: "Introduction" });
  return out;
}

/** Chapter rows for the recording form ({ time: "1:05", title }). */
export function chapterRows(list: Chapter[]) {
  return list.map((c) => ({ time: fmtClock(c.t), title: c.title }));
}

export function studioFileName(title: string, at: Date) {
  const slug = title.replace(/[^\w -]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "class";
  return `studio-${slug}-${at.toISOString().slice(0, 16).replace(/[:T]/g, "-")}.webm`;
}

/** What a view is called in chapter marks and on screen. */
export function sceneTitle(scene: "camera" | "screen" | "board", page: number) {
  if (scene === "camera") return "Camera";
  if (scene === "screen") return "Screen share";
  return page > 0 ? `Whiteboard ${page + 1}` : "Whiteboard";
}
