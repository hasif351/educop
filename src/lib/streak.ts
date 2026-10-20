// Learning streak: consecutive school-time (GST) days with any learning
// activity (lesson progress, a growth check-in or reasoning practice). Pure.

const GST_OFFSET_MS = 4 * 3600_000;
const DAY = 86_400_000;

/** "YYYY-MM-DD" of a moment in Gulf Standard Time. */
export function dayKey(d: Date) {
  return new Date(d.getTime() + GST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Current streak in days. A streak still counts if today has no activity yet
 * but yesterday did, so it doesn't "break" first thing in the morning.
 */
export function learningStreak(dates: Date[], now = new Date()) {
  const days = new Set(dates.map(dayKey));
  let cursor = now.getTime();
  if (!days.has(dayKey(new Date(cursor)))) cursor -= DAY;
  let current = 0;
  while (days.has(dayKey(new Date(cursor)))) { current++; cursor -= DAY; }
  return { current, activeToday: days.has(dayKey(now)), days };
}

/** The last n days (oldest first) with whether each had activity, for a small calendar strip. */
export function recentDays(days: Set<string>, n = 14, now = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getTime() - (n - 1 - i) * DAY);
    return { key: dayKey(d), date: d, active: days.has(dayKey(d)) };
  });
}
