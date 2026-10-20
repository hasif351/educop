import { LEVELS, type Level } from "@/lib/progress";

// Literal class names so Tailwind keeps them.
const CELL: Record<Level, string> = { 0: "bg-bad-soft text-bad", 1: "bg-warn-soft text-warn", 2: "bg-teal-soft text-teal", 3: "bg-good-soft text-good" };

export function HeatCell({ cell }: { cell?: { pct: number; level: Level } }) {
  if (!cell) return <span className="block rounded-md bg-surface-2 px-2 py-1.5 text-center text-xs text-muted" title="No marked work yet">–</span>;
  return (
    <span className={`block rounded-md px-2 py-1.5 text-center text-xs font-bold ${CELL[cell.level]}`} title={`${cell.pct}%`}>
      {LEVELS[cell.level].label}<span className="sr-only"> ({cell.pct}%)</span>
    </span>
  );
}

export function HeatLegend() {
  return (
    <ul className="flex flex-wrap gap-2 text-xs" aria-label="Legend">
      {LEVELS.map((l, i) => <li key={l.label} className={`rounded-md px-2 py-0.5 font-bold ${CELL[i as Level]}`}>{l.label}</li>)}
    </ul>
  );
}

export const TREND_LABEL = { up: "↑ Rising", down: "↓ Dipping", steady: "→ Steady" } as const;
