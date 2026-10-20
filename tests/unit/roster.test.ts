import { describe, expect, it } from "vitest";
import { csvCell, parseCsv, parseGrade, tempPassword, toCsv, validateRoster } from "@/lib/roster";

const ctx = (over: Partial<Parameters<typeof validateRoster>[1]> = {}) => ({
  existingEmails: new Set<string>(), schoolParentEmails: new Set<string>(), seatsLeft: 100, ...over,
});

describe("parseCsv", () => {
  it("handles quotes, commas inside quotes and CRLF", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3')).toEqual([["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);
  });
  it("keeps a trailing empty cell", () => {
    expect(parseCsv("a,b,\n")).toEqual([["a", "b", ""]]);
  });
});

describe("parseGrade", () => {
  it("reads KG and numeric grades", () => {
    expect(parseGrade("KG1")).toBe(-1);
    expect(parseGrade("kg2")).toBe(0);
    expect(parseGrade("Grade 5")).toBe(5);
    expect(parseGrade("12")).toBe(12);
    expect(parseGrade("13")).toBeNull();
    expect(parseGrade("five")).toBeNull();
  });
});

describe("validateRoster", () => {
  it("accepts a header row and valid people", () => {
    const { rows, fileError } = validateRoster(
      "name,email,role,grade,parent_email\nMina Ali,mina@x.example,student,4,dad@x.example\nOmar Ali,dad@x.example,parent,,\nJo Park,jo@x.example,Teacher,,",
      ctx(),
    );
    expect(fileError).toBeUndefined();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.errors.length === 0)).toBe(true);
    expect(rows[0]).toMatchObject({ line: 2, role: "STUDENT", gradeLevel: 4, parentEmail: "dad@x.example" });
  });

  it("works without a header row", () => {
    const { rows } = validateRoster("Ann Lee,ann@x.example,admin,", ctx());
    expect(rows[0]).toMatchObject({ role: "SCHOOL_ADMIN", errors: [] });
  });

  it("reports row-level errors", () => {
    const { rows } = validateRoster(
      "name,email,role,grade,parent_email\nA,bad-email,pupil,\nBo Chan,bo@x.example,student,15\nCy Dee,taken@x.example,teacher,\nDi Eve,di@x.example,teacher,,p@x.example",
      ctx({ existingEmails: new Set(["taken@x.example"]) }),
    );
    expect(rows[0].errors.join(" ")).toMatch(/Name is missing.*Email isn't valid.*Role must be/);
    expect(rows[1].errors).toContain("Students need a grade: KG1, KG2 or 1–12.");
    expect(rows[2].errors).toContain("This email already has an account.");
    expect(rows[3].errors).toContain("Only students can have a parent_email.");
  });

  it("flags duplicates and unknown parents", () => {
    const { rows } = validateRoster("Ann Lee,ann@x.example,student,3,nobody@x.example\nAnn Lee,ANN@x.example,student,3", ctx());
    expect(rows[0].errors[0]).toMatch(/parent_email must be a parent/);
    expect(rows[1].errors).toContain("Same email as line 1.");
  });

  it("accepts a parent who already belongs to the school", () => {
    const { rows } = validateRoster("Ann Lee,ann@x.example,student,3,mum@x.example", ctx({ schoolParentEmails: new Set(["mum@x.example"]) }));
    expect(rows[0].errors).toEqual([]);
  });

  it("respects the seat limit for students only", () => {
    const { rows } = validateRoster("A One,a@x.example,student,1\nB Two,b@x.example,student,1\nC Three,c@x.example,teacher,", ctx({ seatsLeft: 1 }));
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors).toContain("The school's student seat limit is reached.");
    expect(rows[2].errors).toEqual([]);
  });

  it("rejects empty input", () => {
    expect(validateRoster(" \n ", ctx()).fileError).toMatch(/at least one/);
  });
});

describe("tempPassword", () => {
  it("is deterministic with a fixed random source and readable", () => {
    const p = tempPassword(() => 0);
    expect(p).toBe("Aaaa-aaaa-1000");
    expect(tempPassword()).toMatch(/^[A-Z][a-z]{3}-[a-z]{4}-\d{4}$/);
  });
});

describe("CSV output", () => {
  it("quotes and neutralises formulas", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(toCsv([["x", 1], [null, "y"]])).toBe("x,1\r\n,y\r\n");
  });
});
