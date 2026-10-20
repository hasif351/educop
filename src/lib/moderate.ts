// Holds messages that share contact details or links, so parent–teacher and
// class-chat conversations stay on the school platform. Pure and rule-based:
// a held message waits for a school admin (ModerationItem kind "message").

export type ModerationResult = { held: boolean; reasons: string[] };

const EMAIL = /[A-Z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[A-Z0-9.-]+\s*(?:\.|\(dot\)|\[dot\])\s*[A-Z]{2,}/i;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|ae|co|me|ly|gg|app|link|info|biz|xyz|tv)(?:\/\S*)?\b/i;
const SOCIAL = /\b(?:whats\s?app|snap(?:chat)?|insta(?:gram)?|telegram|tiktok|discord)\b/i;

/** Seven or more digits, allowing the spaces, dashes, dots and brackets people put in phone numbers. */
function hasPhone(text: string) {
  const runs = text.match(/\+?\d[\d\s().-]{5,}\d/g) ?? [];
  return runs.some((r) => r.replace(/\D/g, "").length >= 7);
}

export function moderate(text: string): ModerationResult {
  const reasons: string[] = [];
  if (hasPhone(text)) reasons.push("phone number");
  if (EMAIL.test(text)) reasons.push("email address");
  if (URL_RE.test(text)) reasons.push("link");
  if (SOCIAL.test(text)) reasons.push("outside messaging app");
  return { held: reasons.length > 0, reasons };
}

/** One-line description for the moderation queue. */
export function moderationSummary(where: string, from: string, r: ModerationResult) {
  return `${where} from ${from} held for review (${r.reasons.join(", ")})`;
}
