import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { aiUsage } from "@/lib/data-platform";
import { Chip, Empty, PageHeader, fmtDate } from "@/components/ui";

export const metadata = { title: "AI usage" };

const n = (v: number) => v.toLocaleString("en-GB");

export default async function AiUsage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireRole("SUPER_ADMIN");
  const period = (await searchParams).period === "week" ? "week" : "day";
  const { rows, schools } = await aiUsage(period);
  const name = (id: string) => schools.find((s) => s.id === id)?.name ?? "Unknown school";
  const totals = schools.map((s) => {
    const rs = rows.filter((r) => r.schoolId === s.id);
    const sum = (k: "tutorTurns" | "tutorTokens" | "flagged" | "drafts" | "draftTokens" | "accepted") => rs.reduce((a, r) => a + r[k], 0);
    return { ...s, turns: sum("tutorTurns"), drafts: sum("drafts"), accepted: sum("accepted"), tokens: sum("tutorTokens") + sum("draftTokens"), flagged: sum("flagged") };
  });
  const label = (d: Date) => (period === "day" ? fmtDate(d, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : `Week of ${fmtDate(d, { day: "numeric", month: "short", timeZone: "UTC" })}`);
  return (
    <>
      <PageHeader eyebrow="Platform administration" title="AI usage & safety" sub={`Study buddy turns and teacher AI drafts per school, last ${period === "day" ? "14 days" : "8 weeks"} (Gulf time). Counts only: conversation content stays with the school.`} />
      <nav className="flex gap-2" aria-label="Period">
        <Link className={period === "day" ? "btn-primary btn-sm" : "btn btn-sm"} href="/platform/ai-usage" aria-current={period === "day" ? "page" : undefined}>Per day</Link>
        <Link className={period === "week" ? "btn-primary btn-sm" : "btn btn-sm"} href="/platform/ai-usage?period=week" aria-current={period === "week" ? "page" : undefined}>Per week</Link>
      </nav>
      <section className="card overflow-x-auto">
        <h2 className="text-lg">Summary by school</h2>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-3">School</th><th className="py-2 pr-3">AI</th><th className="py-2 pr-3">Study buddy questions</th><th className="py-2 pr-3">Teacher drafts</th><th className="py-2 pr-3">Drafts accepted</th><th className="py-2 pr-3">Tokens</th><th className="py-2">Flagged</th></tr></thead>
          <tbody>{totals.map((t) => (
            <tr key={t.id} className="border-b border-line last:border-0">
              <td className="py-2.5 pr-3 font-bold">{t.name}</td><td className="py-2.5 pr-3"><Chip tone={t.aiEnabled ? "good" : "plain"}>{t.aiEnabled ? "On" : "Off"}</Chip></td>
              <td className="tnum py-2.5 pr-3">{n(t.turns)}</td><td className="tnum py-2.5 pr-3">{n(t.drafts)}</td><td className="tnum py-2.5 pr-3">{t.drafts ? `${Math.round((t.accepted / t.drafts) * 100)}%` : "–"}</td>
              <td className="tnum py-2.5 pr-3">{n(t.tokens)}</td><td className="py-2.5">{t.flagged ? <Chip tone="warn">{t.flagged}</Chip> : <span className="tnum">0</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="text-lg">{period === "day" ? "Per day" : "Per week"}</h2>
        {rows.length === 0 ? <Empty title="No AI activity in this period" body="Usage appears once students use the study buddy or teachers use the AI assistant." /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-3">{period === "day" ? "Day" : "Week"}</th><th className="py-2 pr-3">School</th><th className="py-2 pr-3">Study buddy questions</th><th className="py-2 pr-3">Tutor tokens</th><th className="py-2 pr-3">Teacher drafts</th><th className="py-2 pr-3">Draft tokens</th><th className="py-2">Flagged</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={`${r.schoolId}${r.bucket.toISOString()}`} className="border-b border-line last:border-0">
                <td className="tnum py-2 pr-3">{label(r.bucket)}</td><td className="py-2 pr-3">{name(r.schoolId)}</td><td className="tnum py-2 pr-3">{n(r.tutorTurns)}</td><td className="tnum py-2 pr-3">{n(r.tutorTokens)}</td>
                <td className="tnum py-2 pr-3">{n(r.drafts)}</td><td className="tnum py-2 pr-3">{n(r.draftTokens)}</td><td className="tnum py-2">{r.flagged}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <p className="text-xs text-muted">Tokens are what the model reported (input + output). Offline template fallbacks use none.</p>
      </section>
    </>
  );
}
