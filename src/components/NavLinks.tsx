"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="Main">
      {items.map((i) => {
        const on = path === i.href || (i.href.split("/").length > 2 && path.startsWith(i.href));
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-bold ${on ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-fg"}`}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
