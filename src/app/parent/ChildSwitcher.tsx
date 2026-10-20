import Link from "next/link";
import { gradeLabel } from "@/lib/roster";

/** Verified children as large links; the selected one is marked as current. */
export function ChildSwitcher({ kids, selected, base }: { kids: { id: string; name: string; gradeLevel: number | null }[]; selected: string; base: string }) {
  return (
    <nav aria-label="Choose a child" className="flex flex-wrap gap-3">
      {kids.map((k) => {
        const on = k.id === selected;
        const initials = k.name.split(" ").map((p) => p[0]).slice(0, 2).join("");
        return (
          <Link key={k.id} href={`${base}?child=${k.id}`} aria-current={on ? "page" : undefined}
            className={`flex min-w-[12rem] items-center gap-3 rounded-card border p-3 ${on ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-surface-2"}`}>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-teal-soft font-display text-sm font-bold text-teal" aria-hidden>{initials}</span>
            <div><h2 className="text-base">{k.name}</h2><div className="text-xs text-muted">{gradeLabel(k.gradeLevel)}{on ? " · showing" : ""}</div></div>
          </Link>
        );
      })}
    </nav>
  );
}
