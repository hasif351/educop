import { describe, expect, it } from "vitest";
import { roleForPath } from "@/lib/roles";

describe("route ownership", () => {
  it("maps URL prefixes to roles", () => {
    expect(roleForPath("/student")).toBe("STUDENT");
    expect(roleForPath("/student/lessons/abc")).toBe("STUDENT");
    expect(roleForPath("/teacher/assignments/new")).toBe("TEACHER");
    expect(roleForPath("/platform")).toBe("SUPER_ADMIN");
  });
  it("doesn't match look-alike prefixes", () => {
    expect(roleForPath("/students")).toBeNull();
    expect(roleForPath("/login")).toBeNull();
  });
});
