import { describe, expect, it } from "vitest";
import { timeAgo } from "@/lib/datetime";

describe("timeAgo", () => {
  const now = new Date("2026-10-20T08:00:00Z");
  it("reads like the notification centre", () => {
    expect(timeAgo(new Date("2026-10-20T07:59:40Z"), now)).toBe("Just now");
    expect(timeAgo(new Date("2026-10-20T07:52:00Z"), now)).toBe("8 min ago");
    expect(timeAgo(new Date("2026-10-20T06:00:00Z"), now)).toBe("2 h ago");
    expect(timeAgo(new Date("2026-10-19T06:00:00Z"), now)).toBe("Yesterday");
    expect(timeAgo(new Date("2026-10-12T06:00:00Z"), now)).toBe("12 Oct");
  });
});
