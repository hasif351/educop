import { describe, expect, it } from "vitest";
import { isPresent, jitsiUrl, minutesAttended, myVote, newRoomName, shortName, tallyPoll } from "@/lib/live-utils";

describe("virtual classroom helpers", () => {
  it("makes long random room names", () => {
    const a = newRoomName();
    expect(a).toMatch(/^educop-[0-9a-f]{32}$/);
    expect(newRoomName()).not.toBe(a);
    expect(newRoomName(new Uint8Array(16))).toBe("educop-" + "0".repeat(32));
  });

  it("builds a Jitsi URL with the display name in the hash", () => {
    const u = jitsiUrl("educop-abc", { displayName: "Sara Mitchell" });
    expect(u.startsWith("https://meet.jit.si/educop-abc#")).toBe(true);
    expect(u).toContain("userInfo.displayName=%22Sara%20Mitchell%22");
  });

  it("counts presence from recent heartbeats", () => {
    const now = new Date("2026-10-20T10:00:30Z");
    expect(isPresent(new Date("2026-10-20T10:00:15Z"), now)).toBe(true);
    expect(isPresent(new Date("2026-10-20T09:59:00Z"), now)).toBe(false);
    expect(minutesAttended(new Date("2026-10-20T10:00:00Z"), new Date("2026-10-20T10:38:40Z"))).toBe(39);
    expect(minutesAttended(new Date("2026-10-20T10:00:00Z"), new Date("2026-10-20T10:00:05Z"))).toBe(1);
  });

  it("tallies poll votes and ignores bad entries", () => {
    const votes = { a: 0, b: 1, c: 0, d: 7, e: "x" };
    expect(tallyPoll(["Yes", "No", "Not sure"], votes)).toEqual({ counts: [2, 1, 0], total: 3 });
    expect(tallyPoll(["Yes"], null)).toEqual({ counts: [0], total: 0 });
    expect(myVote(votes, "b")).toBe(1);
    expect(myVote(votes, "z")).toBeNull();
  });

  it("shortens classmates' names", () => {
    expect(shortName("Hamdan Al Suwaidi")).toBe("Hamdan S.");
    expect(shortName("Noah Fernandes")).toBe("Noah F.");
    expect(shortName("Kenji")).toBe("Kenji");
  });
});
