import Link from "next/link";

type Tone = "blue" | "teal" | "good" | "warn" | "bad" | "plain";
const toneClass: Record<Tone, string> = {
  blue: "bg-brand-soft text-brand",
  teal: "bg-teal-soft text-teal",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  plain: "",
};

export function Chip({ children, tone = "plain" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`chip ${toneClass[tone]}`}>{children}</span>;
}

export function Bar({ value, tone = "blue" }: { value: number; tone?: "blue" | "teal" }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${tone === "teal" ? "bg-teal" : "bg-brand"}`} style={{ width: `${v}%` }} />
    </div>
  );
}

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: React.ReactNode; title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="text-2xl">{title}</h1>
        {sub && <p className="mt-1 text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, body, href, cta }: { title: string; body: string; href?: string; cta?: string }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-line p-4 text-sm">
      <b>{title}</b>
      <p className="text-muted">{body}</p>
      {href && cta && <Link className="btn btn-sm" href={href}>{cta}</Link>}
    </div>
  );
}

export function scoreTone(pct: number | null): Tone {
  if (pct == null) return "plain";
  return pct >= 85 ? "good" : pct >= 60 ? "teal" : "warn";
}

export function fmtDate(d: Date, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", ...opts }).format(d);
}
export function fmtTime(d: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit" }).format(d);
}
