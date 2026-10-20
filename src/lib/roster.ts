// Pure roster-import rules: CSV parsing, row validation and temporary passwords.
// Kept free of database access so the dry run and the commit use the same checks
// and both are easy to test. The caller supplies what the database knows.

export type RosterRole = "STUDENT" | "TEACHER" | "PARENT" | "SCHOOL_ADMIN";

export type RosterRow = {
  line: number; // 1-based line in the pasted text, for error messages
  name: string;
  email: string;
  role: RosterRole | null;
  gradeLevel: number | null;
  parentEmail: string | null;
  errors: string[];
};

export type RosterContext = {
  /** Emails that already have an account anywhere on the platform (lower-case). */
  existingEmails: Set<string>;
  /** Emails of parents already in this school (lower-case). */
  schoolParentEmails: Set<string>;
  /** Student seats left before the school's seat limit. */
  seatsLeft: number;
};

export const MAX_ROSTER_ROWS = 200;
const COLUMNS = ["name", "email", "role", "grade", "parent_email"] as const;

/** Splits CSV text into rows of cells. Handles quoted cells, doubled quotes and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") { quoted = true; cell = ""; }
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim()));
}

const ROLE_WORDS: Record<string, RosterRole> = {
  student: "STUDENT", teacher: "TEACHER", parent: "PARENT", guardian: "PARENT",
  admin: "SCHOOL_ADMIN", "school admin": "SCHOOL_ADMIN", school_admin: "SCHOOL_ADMIN",
};
export function parseRole(v: string): RosterRole | null {
  return ROLE_WORDS[v.trim().toLowerCase()] ?? null;
}

/** "KG1" → -1, "KG2" → 0, "Grade 5" / "5" → 5. Null when it isn't a KG–12 grade. */
export function parseGrade(v: string): number | null {
  const s = v.trim().toUpperCase().replace(/^GRADE\s*/, "").replace(/^G(?=\d)/, "");
  if (s === "KG1") return -1;
  if (s === "KG2" || s === "KG") return 0;
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 12 ? n : null;
}

export function gradeLabel(g: number | null | undefined) {
  if (g == null) return "";
  return g === -1 ? "KG1" : g === 0 ? "KG2" : `Grade ${g}`;
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Turns CSV text into validated rows. Nothing here touches the database. */
export function validateRoster(text: string, ctx: RosterContext): { rows: RosterRow[]; fileError?: string } {
  const lines = parseCsv(text);
  const numbered = lines.map((cells, i) => ({ cells, line: i + 1 })).filter((r) => r.cells.some((c) => c !== ""));
  if (numbered.length === 0) return { rows: [], fileError: "Paste or upload a CSV with at least one person." };

  // The header row is optional; when present it may order the columns differently.
  let order: string[] = [...COLUMNS];
  const head = numbered[0].cells.map((c) => c.toLowerCase().replace(/\s+/g, "_"));
  if (head.includes("email") && head.includes("name")) {
    order = head;
    numbered.shift();
  }
  if (numbered.length > MAX_ROSTER_ROWS) return { rows: [], fileError: `Import at most ${MAX_ROSTER_ROWS} people at a time.` };

  const col = (cells: string[], key: string) => {
    const i = order.indexOf(key);
    return i >= 0 ? cells[i] ?? "" : "";
  };
  const rows: RosterRow[] = numbered.map(({ cells, line }) => {
    const errors: string[] = [];
    const name = col(cells, "name");
    const email = col(cells, "email").toLowerCase();
    const roleRaw = col(cells, "role");
    const gradeRaw = col(cells, "grade");
    const parentRaw = col(cells, "parent_email").toLowerCase();
    if (name.length < 2) errors.push("Name is missing.");
    else if (name.length > 120) errors.push("Name is too long.");
    if (!EMAIL.test(email) || email.length > 200) errors.push("Email isn't valid.");
    const role = parseRole(roleRaw);
    if (!role) errors.push(`Role must be student, teacher, parent or admin${roleRaw ? ` (got "${roleRaw.slice(0, 20)}")` : ""}.`);
    let gradeLevel: number | null = null;
    if (role === "STUDENT") {
      gradeLevel = parseGrade(gradeRaw);
      if (gradeLevel == null) errors.push("Students need a grade: KG1, KG2 or 1–12.");
    }
    let parentEmail: string | null = null;
    if (parentRaw) {
      if (role !== "STUDENT") errors.push("Only students can have a parent_email.");
      else if (!EMAIL.test(parentRaw)) errors.push("parent_email isn't valid.");
      else parentEmail = parentRaw;
    }
    return { line, name, email, role, gradeLevel, parentEmail, errors };
  });

  // Checks that need the whole file or what the database already holds.
  const seen = new Map<string, number>();
  const parentsInFile = new Set(rows.filter((r) => r.role === "PARENT" && r.errors.length === 0).map((r) => r.email));
  let seats = ctx.seatsLeft;
  for (const r of rows) {
    if (r.email) {
      const first = seen.get(r.email);
      if (first != null) r.errors.push(`Same email as line ${first}.`);
      else seen.set(r.email, r.line);
      if (ctx.existingEmails.has(r.email)) r.errors.push("This email already has an account.");
    }
    if (r.parentEmail && !parentsInFile.has(r.parentEmail) && !ctx.schoolParentEmails.has(r.parentEmail)) {
      r.errors.push("parent_email must be a parent in this school or a parent row in this file.");
    }
    if (r.role === "STUDENT" && r.errors.length === 0) {
      if (seats <= 0) r.errors.push("The school's student seat limit is reached.");
      else seats--;
    }
  }
  return { rows };
}

/** A readable temporary password: three short words-ish chunks plus digits. Shown once. */
export function tempPassword(random: (n: number) => number = (n) => Math.floor(Math.random() * n)) {
  const letters = "abcdefghjkmnpqrstuvwxyz"; // no i, l, o
  const chunk = () => Array.from({ length: 4 }, () => letters[random(letters.length)]).join("");
  const digits = String(1000 + random(9000));
  const c = chunk();
  return `${c[0].toUpperCase()}${c.slice(1)}-${chunk()}-${digits}`;
}

/** Escapes one CSV cell, and neutralises spreadsheet formulas. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
