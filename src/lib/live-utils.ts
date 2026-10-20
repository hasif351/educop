// Pure helpers for the virtual classroom (src/lib/live.ts does the data access).

/** A student counts as "in class" if their page polled within this window. */
export const PRESENT_WINDOW_MS = 20_000;

/** Long, unguessable Jitsi room name: 128 random bits, so a link can't be guessed. */
export function newRoomName(bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(16))) {
  return "educop-" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function jitsiUrl(roomName: string, opts: { displayName: string }) {
  // Settings in the URL hash are read by Jitsi Meet on load; nothing is sent to our server.
  const cfg = [
    `userInfo.displayName=${encodeURIComponent(JSON.stringify(opts.displayName))}`,
    "config.prejoinConfig.enabled=false",
    "config.startWithVideoMuted=true",
    "config.startWithAudioMuted=true",
    "config.disableDeepLinking=true",
  ];
  return `https://meet.jit.si/${encodeURIComponent(roomName)}#${cfg.join("&")}`;
}

export type VideoProvider = "teams" | "meet" | "jitsi";
export const PROVIDER_LABEL: Record<VideoProvider, string> = { teams: "Microsoft Teams", meet: "Google Meet", jitsi: "Built-in room" };

/**
 * Checks a pasted meeting link and says which service it belongs to. Only
 * https join links on the official Teams and Meet hosts are accepted, so a
 * class link can't point students anywhere else.
 */
export function parseMeetingUrl(raw: string): { provider: "teams" | "meet"; url: string } | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if ((host === "teams.microsoft.com" || host === "teams.live.com") && u.pathname.length > 1) return { provider: "teams", url: u.toString() };
  if (host === "meet.google.com" && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(u.pathname)) return { provider: "meet", url: u.toString() };
  return null;
}

/** What the classroom shows: the embedded built-in room, or a button that opens Teams or Meet. */
export function videoFor(session: { provider: string; meetingUrl: string | null; roomName: string }, displayName: string) {
  if ((session.provider === "teams" || session.provider === "meet") && session.meetingUrl) return { provider: session.provider as "teams" | "meet", url: session.meetingUrl };
  return { provider: "jitsi" as const, url: jitsiUrl(session.roomName, { displayName }) };
}

export function isPresent(lastSeenAt: Date, now = new Date()) {
  return now.getTime() - lastSeenAt.getTime() <= PRESENT_WINDOW_MS;
}

/** Minutes between joining and the last heartbeat, rounded, at least 1 once joined. */
export function minutesAttended(joinedAt: Date, lastSeenAt: Date) {
  return Math.max(1, Math.round((lastSeenAt.getTime() - joinedAt.getTime()) / 60_000));
}

/** Votes are stored as { userId: optionIndex }. Invalid entries are ignored. */
export function tallyPoll(options: string[], votes: unknown) {
  const counts = options.map(() => 0);
  if (votes && typeof votes === "object") {
    for (const v of Object.values(votes as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < options.length) counts[v]++;
    }
  }
  const total = counts.reduce((a, b) => a + b, 0);
  return { counts, total };
}

export function myVote(votes: unknown, userId: string): number | null {
  if (!votes || typeof votes !== "object") return null;
  const v = (votes as Record<string, unknown>)[userId];
  return typeof v === "number" ? v : null;
}

/** Can a session be joined? Students may only join while it is live. */
export function joinable(status: string) {
  return status === "LIVE";
}

/** "Noah Fernandes" -> "Noah F." when classmates see each other. */
export function shortName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
}
