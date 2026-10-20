/** Formats a Date as a datetime-local value in school time (GST, UTC+4). */
export function toLocalInput(d: Date) {
  return new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 16);
}
