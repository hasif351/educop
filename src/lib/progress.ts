// Pure progress rules for the teacher's student progress views. Kept free of
// database access so they are easy to test. These support teacher judgement;
// they never rank students or appear anywhere a student or parent can see them.

export type Level = 0 | 1 | 2 | 3;
export const LEVELS: { label: string; tone: "bad" | "warn" | "teal" | "good" }[] = [
  { label: "Beginning", tone: "bad" },
  { label: "Developing", tone: "warn" },
  { label: "Secure", tone: "teal" },
  { label: "Extending", tone: "good" },
];

/** Mastery band for a percentage. Secure starts at 70%. */
export function masteryLevel(pct: number | null): Level | null {
  if (pct == null) return null;
  return pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 50 ? 1 : 0;
}

export type Trend = "up" | "down" | "steady";

/** Compares the latest result with the average of the earlier ones (chronological order). */
export function trend(pcts: number[], threshold = 5): Trend | null {
  if (pcts.length < 2) return null;
  const last = pcts[pcts.length - 1];
  const earlier = pcts.slice(0, -1);
  const avg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  if (last - avg >= threshold) return "up";
  if (avg - last >= threshold) return "down";
  return "steady";
}

/** Sums score/max pairs into one percentage, or null when nothing has been marked. */
export function pooledPct(parts: { score: number; max: number }[]): number | null {
  const max = parts.reduce((a, p) => a + p.max, 0);
  if (max <= 0) return null;
  return Math.round((parts.reduce((a, p) => a + p.score, 0) / max) * 100);
}

export type SupportSignals = {
  avgPct: number | null;
  missing: number;
  activeReview: number;
  sharedLowMood: number;
};

/**
 * Reasons a student may benefit from a check-in, in plain words. A starting
 * point for a conversation, not a judgement.
 */
export function supportReasons(s: SupportSignals): string[] {
  const out: string[] = [];
  if (s.avgPct != null && s.avgPct < 60) out.push(`Average on marked work is ${s.avgPct}%`);
  if (s.missing > 0) out.push(`${s.missing} assignment${s.missing === 1 ? "" : "s"} not handed in`);
  if (s.activeReview > 0) out.push(`${s.activeReview} review suggestion${s.activeReview === 1 ? "" : "s"} still open`);
  if (s.sharedLowMood > 0) out.push(`Shared a low-mood check-in${s.sharedLowMood > 1 ? ` ${s.sharedLowMood} times` : ""} recently`);
  return out;
}
