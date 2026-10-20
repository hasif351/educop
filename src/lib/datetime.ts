/** Formats a Date as a datetime-local value in school time (GST, UTC+4). */
export function toLocalInput(d: Date) {
  return new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 16);
}

/** "8 min ago", "2 h ago", "Yesterday", then a short date (school time). */
export function timeAgo(d: Date, now = new Date()) {
  const min = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  if (h < 48) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short" }).format(d);
}
