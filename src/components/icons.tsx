// Line icons from the UI preview (24×24, stroked with currentColor).
const P = {
  home: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z",
  book: "M4 19.5V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM20 19v3H6",
  play: "M8 5v14l11-7z",
  brain: "M12 4a3.5 3.5 0 0 0-6.5 1.5A3.5 3.5 0 0 0 4 12a3.5 3.5 0 0 0 2 6.5A3 3 0 0 0 12 20zM12 4a3.5 3.5 0 0 1 6.5 1.5A3.5 3.5 0 0 1 20 12a3.5 3.5 0 0 1-2 6.5A3 3 0 0 1 12 20",
  heart: "M12 20s-7-4.4-9.3-8.8A5 5 0 0 1 12 6.2a5 5 0 0 1 9.3 5C19 15.6 12 20 12 20z",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z",
  video: "M3 7h12v10H3zM15 10.5l6-3.5v10l-6-3.5",
  bell: "M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9M10 21h4",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.1 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 20.9 10H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  clip: "M9 3h6v3H9zM7 5H5v16h14V5h-2M8 12h8M8 16h5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6 6 18",
  school: "M3 21h18M5 21V10l7-5 7 5v11M9 21v-5h6v5M12 11h.01",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  hand: "M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v7M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7 6.5 6.5 0 0 1-5.4-3L2.5 14a1.5 1.5 0 0 1 2.6-1.5L8 15.5",
  chat: "M21 12a8 8 0 0 1-11.8 7l-6.2 2 2-5.6A8 8 0 1 1 21 12z",
  poll: "M4 20V11M10 20V4M16 20v-6M2 20h20",
  menu: "M4 6h16M4 12h16M4 18h16",
  plus: "M12 5v14M5 12h14",
  download: "M12 4v12M6 11l6 6 6-6M4 20h16",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  flag: "M5 21V4h11l-2 4 2 4H5",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
  award: "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14 7 22l5-3 5 3-1.5-8",
  layers: "M12 3 2 8l10 5 10-5zM2 13l10 5 10-5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  door: "M14 3H6v18h8M14 3l5 2v14l-5 2zM11 12h.01",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7h.01",
  send: "M4 12 20 4l-6 16-3-7z",
  mail: "M3 5h18v14H3zM3 6l9 7 9-7",
} as const;

export type IconName = keyof typeof P;

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-[1.15em] w-[1.15em] flex-none fill-none stroke-current ${className}`} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={P[name]} />
    </svg>
  );
}

/** Icon for a nav route, by its last path segment (the role home is "home"). */
const BY_SEGMENT: Record<string, IconName> = {
  lessons: "play", assignments: "clip", skills: "brain", growth: "heart", "for-you": "spark", buddy: "chat", live: "video",
  ai: "spark", progress: "target", recommendations: "layers", messages: "mail", "home-learning": "spark",
  users: "users", classes: "book", approvals: "flag", reports: "chart", moderation: "shield", school: "school",
  schools: "school", "ai-usage": "chart", audit: "lock", notifications: "bell", settings: "gear",
};
export function navIcon(href: string): IconName {
  const parts = href.split("/").filter(Boolean);
  if (parts.length === 1) return parts[0] === "platform" ? "globe" : parts[0] === "admin" ? "school" : parts[0] === "parent" ? "users" : "home";
  return BY_SEGMENT[parts[parts.length - 1]] ?? "info";
}
