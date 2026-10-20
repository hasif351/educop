import { z } from "zod";

// User preferences stored in User.prefs (JSON). Everything has a default, so an
// empty or partly-written prefs object (older rows, hand-edited data) still reads
// as a complete Prefs value. Pure: safe to import from client and server code.

export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية (Arabic, right-to-left) - coming in a later release" },
] as const;

export const TIME_ZONES = [
  { value: "Asia/Dubai", label: "Gulf Standard Time (UTC+4)" },
  { value: "Asia/Riyadh", label: "Arabia Standard Time (UTC+3)" },
  { value: "Asia/Karachi", label: "Pakistan Standard Time (UTC+5)" },
  { value: "Asia/Kolkata", label: "India Standard Time (UTC+5:30)" },
  { value: "Europe/London", label: "UK time (GMT/BST)" },
] as const;

const lang = z.enum(["en", "ar"]);
const tz = z.enum(TIME_ZONES.map((t) => t.value) as [string, ...string[]]);

export const PrefsSchema = z.object({
  language: lang.default("en"),
  timeZone: tz.default("Asia/Dubai"),
  a11y: z.object({
    largerText: z.boolean().default(false),
    calm: z.boolean().default(false), // reduced motion, quieter visuals
    captions: z.boolean().default(true),
    readAloud: z.boolean().default(false),
  }).default({}),
  notify: z.object({
    email: z.boolean().default(true),
    push: z.boolean().default(true),
    sms: z.boolean().default(false),
    digest: z.boolean().default(true),
  }).default({}),
});

export type Prefs = z.infer<typeof PrefsSchema>;
export const DEFAULT_PREFS: Prefs = PrefsSchema.parse({});

/**
 * Reads whatever is stored in User.prefs. Unknown keys are dropped and any
 * invalid field falls back to its default instead of failing the whole object.
 */
export function readPrefs(raw: unknown): Prefs {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const pick = <T>(schema: z.ZodType<T>, v: unknown, fallback: T): T => {
    const r = schema.safeParse(v);
    return r.success ? r.data : fallback;
  };
  const group = <K extends "a11y" | "notify">(key: K): Prefs[K] => {
    const src = obj[key] && typeof obj[key] === "object" ? (obj[key] as Record<string, unknown>) : {};
    const out = { ...DEFAULT_PREFS[key] } as Record<string, boolean>;
    for (const k of Object.keys(out)) if (typeof src[k] === "boolean") out[k] = src[k] as boolean;
    return out as Prefs[K];
  };
  return {
    language: pick(lang, obj.language, DEFAULT_PREFS.language),
    timeZone: pick(tz, obj.timeZone, DEFAULT_PREFS.timeZone),
    a11y: group("a11y"),
    notify: group("notify"),
  };
}

/** Applies a validated partial update on top of the stored prefs. */
export function mergePrefs(current: unknown, patch: { language?: Prefs["language"]; timeZone?: string; a11y?: Partial<Prefs["a11y"]>; notify?: Partial<Prefs["notify"]> }): Prefs {
  const base = readPrefs(current);
  return readPrefs({
    ...base,
    ...(patch.language ? { language: patch.language } : {}),
    ...(patch.timeZone ? { timeZone: patch.timeZone } : {}),
    a11y: { ...base.a11y, ...patch.a11y },
    notify: { ...base.notify, ...patch.notify },
  });
}

/** Class names the app shell puts on its root so globals.css can apply them to <html>. */
export function prefClasses(p: Prefs) {
  return [p.a11y.largerText && "pref-large-text", p.a11y.calm && "pref-calm"].filter(Boolean).join(" ");
}

/** Checkbox values from a form: present = on. */
export function checkboxes<K extends string>(form: FormData, keys: readonly K[]): Record<K, boolean> {
  return Object.fromEntries(keys.map((k) => [k, form.get(k) === "on"])) as Record<K, boolean>;
}

// ---------------- Consents ----------------

// Consents live in the Consent table on the CHILD's userId. Parents change them,
// students see them read-only. Plain-language text is shown next to each switch.
export const CONSENTS = [
  { key: "ai_tutor", label: "AI study buddy", body: "Your child can ask the AI study buddy for hints on schoolwork. It gives hints before answers, and teachers can see a chat only if it is flagged for safety." },
  { key: "sel_share_teacher", label: "Share wellbeing check-ins with teachers", body: "If your child chooses to share a check-in, their class teacher can read it. Without this, check-ins stay private to your child." },
  { key: "analytics", label: "Anonymous improvement analytics", body: "Usage counts without names help the school and Educop improve lessons. Your child's work is never used to train outside AI models." },
  { key: "photo_media", label: "Photos and class recordings", body: "Your child may appear in class photos or live-class recordings shared privately with the class for up to 30 days." },
] as const;
export type ConsentKey = (typeof CONSENTS)[number]["key"];
export const CONSENT_KEYS = CONSENTS.map((c) => c.key) as [ConsentKey, ...ConsentKey[]];
