import { describe, expect, it } from "vitest";
import { moderate, moderationSummary } from "@/lib/moderate";

describe("message moderation", () => {
  it("lets ordinary messages through", () => {
    for (const t of [
      "Hi Ms. Mitchell, how can we help Layla practise fractions at home?",
      "Layla scored 6/6 on the check-in. Page 12, questions 3 to 5.",
      "Is 2/4 the same as 1/2?",
      "The meeting is at 10:30 on 3 Nov in room 204.",
      "We read chapters 1.2 and 1.3.",
    ]) expect(moderate(t)).toEqual({ held: false, reasons: [] });
  });

  it("holds phone numbers in common formats", () => {
    for (const t of ["Call me on 050 123 4567", "+971-50-123-4567", "my number is (04) 555 1234", "0501234567"]) {
      expect(moderate(t).reasons).toContain("phone number");
    }
  });

  it("holds email addresses, including spelled-out ones", () => {
    expect(moderate("email me at rania@example.com").reasons).toContain("email address");
    expect(moderate("rania (at) example (dot) com").reasons).toContain("email address");
  });

  it("holds links and outside messaging apps", () => {
    expect(moderate("see https://example.com/x").reasons).toContain("link");
    expect(moderate("go to www.games.example").reasons).toContain("link");
    expect(moderate("look at funmaths.com").reasons).toContain("link");
    expect(moderate("add me on WhatsApp").reasons).toContain("outside messaging app");
  });

  it("summarises reasons", () => {
    const r = moderate("call 0501234567 or visit example.com");
    expect(r.held).toBe(true);
    expect(moderationSummary("Message", "Rania Hassan", r)).toBe("Message from Rania Hassan held for review (phone number, link)");
  });
});
