"use client";
import { useActionState, useState, type ChangeEvent } from "react";
import { keepValues } from "@/components/submit";
import { gradeLabel } from "@/lib/roster";
import { importRoster, type RosterState } from "../../actions";

const ROLE: Record<string, string> = { STUDENT: "Student", TEACHER: "Teacher", PARENT: "Parent", SCHOOL_ADMIN: "School admin" };
const SAMPLE = "name,email,role,grade,parent_email\nMina Ali,mina.ali@yourschool.example,student,4,omar.ali@example.com\nOmar Ali,omar.ali@example.com,parent,,\n";

export function RosterImport() {
  const [state, action, pending] = useActionState<RosterState, FormData>(importRoster, {});
  const [csv, setCsv] = useState("");
  const [fileNote, setFileNote] = useState<string | null>(null);
  const rows = state.preview ?? [];
  const ready = rows.filter((r) => r.errors.length === 0).length;

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 200_000) { setFileNote("That file is too large (200 KB maximum)."); return; }
    f.text().then((t) => { setCsv(t); setFileNote(`Loaded ${f.name}. Preview it before importing.`); });
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={keepValues(action)} className="card gap-4">
        <h2 className="text-lg">1. Paste or upload a CSV</h2>
        <p className="text-sm text-muted">Columns: <code>name,email,role,grade[,parent_email]</code>. Role is student, teacher, parent or admin. Grade is KG1, KG2 or 1–12 (students only). A header row is optional. Up to 200 people per import.</p>
        <label className="label">Upload a .csv file<input className="input" type="file" accept=".csv,text/csv" onChange={onFile} /></label>
        {fileNote && <p role="status" className="text-sm text-muted">{fileNote}</p>}
        <label className="label">CSV text
          <textarea className="input font-mono text-xs" name="csv" rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={SAMPLE} spellCheck={false} />
        </label>
        {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn" name="intent" value="preview" disabled={pending || !csv.trim()}>{pending ? "Checking…" : "Preview (dry run)"}</button>
          {state.preview && ready > 0 && <button className="btn-primary" name="intent" value="commit" disabled={pending}>Import {ready} {ready === 1 ? "person" : "people"}</button>}
        </div>
      </form>

      {state.preview && (
        <section className="card overflow-x-auto" aria-live="polite">
          <h2 className="text-lg">2. Dry run: nothing has been created yet</h2>
          <p className="text-sm"><b>{ready}</b> ready · <b className={rows.length - ready ? "text-bad" : ""}>{rows.length - ready}</b> with errors (these will be skipped) · {state.seatsLeft} student seats left</p>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-3">Line</th><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Email</th><th className="py-2 pr-3">Role</th><th className="py-2 pr-3">Grade</th><th className="py-2 pr-3">Parent</th><th className="py-2">Check</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.line} className={`border-b border-line last:border-0 ${r.errors.length ? "bg-bad-soft/40" : ""}`}>
                <td className="tnum py-2 pr-3">{r.line}</td><td className="py-2 pr-3">{r.name}</td><td className="py-2 pr-3">{r.email}</td>
                <td className="py-2 pr-3">{r.role ? ROLE[r.role] : "–"}</td><td className="py-2 pr-3">{gradeLabel(r.gradeLevel)}</td><td className="py-2 pr-3">{r.parentEmail ?? ""}</td>
                <td className="py-2">{r.errors.length === 0 ? <span className="chip bg-good-soft text-good">Ready</span> : <ul className="text-xs font-bold text-bad">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      {state.created && (
        <section className="card overflow-x-auto" role="status">
          <h2 className="text-lg">Imported {state.created.length} {state.created.length === 1 ? "person" : "people"}</h2>
          {state.skipped ? <p className="text-sm text-muted">{state.skipped} row{state.skipped === 1 ? " was" : "s were"} skipped because of errors.</p> : null}
          <p className="rounded-lg bg-warn-soft p-3 text-sm text-warn"><b>Copy these temporary passwords now.</b> They are shown only once. Share them securely and ask everyone to change theirs after signing in.</p>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Email</th><th className="py-2 pr-3">Role</th><th className="py-2">Temporary password</th></tr></thead>
            <tbody>{state.created.map((c) => (
              <tr key={c.email} className="border-b border-line last:border-0"><td className="py-2 pr-3">{c.name}</td><td className="py-2 pr-3">{c.email}</td><td className="py-2 pr-3">{ROLE[c.role]}</td><td className="py-2"><code className="tnum font-bold">{c.password}</code></td></tr>
            ))}</tbody>
          </table>
        </section>
      )}
    </div>
  );
}
