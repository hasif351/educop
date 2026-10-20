import { describe, expect, it } from "vitest";
import { CONSENT_KEYS, DEFAULT_PREFS, checkboxes, mergePrefs, prefClasses, readPrefs } from "@/lib/prefs";

describe("user preferences", () => {
  it("fills defaults for empty or broken values", () => {
    expect(readPrefs({})).toEqual(DEFAULT_PREFS);
    expect(readPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(readPrefs("nonsense")).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS).toMatchObject({ language: "en", timeZone: "Asia/Dubai", a11y: { captions: true, largerText: false }, notify: { email: true, sms: false } });
  });

  it("keeps valid fields and drops invalid or unknown ones", () => {
    const p = readPrefs({ language: "fr", timeZone: "Europe/London", a11y: { largerText: true, calm: "yes" }, extra: 1 });
    expect(p.language).toBe("en");
    expect(p.timeZone).toBe("Europe/London");
    expect(p.a11y).toEqual({ ...DEFAULT_PREFS.a11y, largerText: true });
    expect(p).not.toHaveProperty("extra");
  });

  it("merges a partial update", () => {
    const stored = { a11y: { largerText: true }, notify: { sms: true } };
    const p = mergePrefs(stored, { a11y: { calm: true }, notify: { email: false } });
    expect(p.a11y).toMatchObject({ largerText: true, calm: true });
    expect(p.notify).toMatchObject({ sms: true, email: false, push: true });
    expect(mergePrefs(stored, { timeZone: "Mars/Base" }).timeZone).toBe("Asia/Dubai");
  });

  it("turns accessibility prefs into shell classes", () => {
    expect(prefClasses(DEFAULT_PREFS)).toBe("");
    expect(prefClasses(mergePrefs({}, { a11y: { largerText: true, calm: true } }))).toBe("pref-large-text pref-calm");
  });

  it("reads checkboxes from a form", () => {
    const fd = new FormData();
    fd.set("email", "on");
    expect(checkboxes(fd, ["email", "sms"] as const)).toEqual({ email: true, sms: false });
  });

  it("lists the four consents", () => {
    expect(CONSENT_KEYS).toEqual(["ai_tutor", "sel_share_teacher", "analytics", "photo_media"]);
  });
});
