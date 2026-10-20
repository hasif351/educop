"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, navIcon } from "./icons";

type Item = { href: string; label: string };

const isOn = (path: string, href: string) => path === href || (href.split("/").length > 2 && path.startsWith(href));

export function NavLinks({ items, badges = {} }: { items: Item[]; badges?: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {items.map((i) => {
        const on = isOn(path, i.href);
        const n = badges[i.href] ?? 0;
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
            className={`flex items-center gap-3 rounded-[9px] px-3 py-2 text-sm font-bold ${on ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-fg"}`}>
            <Icon name={navIcon(i.href)} />
            <span>{i.label}</span>
            {n > 0 && <span className="tnum ml-auto rounded-full bg-bad px-2 text-[11px] text-white"><span aria-hidden="true">{n}</span><span className="sr-only">, {n} unread</span></span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Title of the current page in the top bar, from the longest matching nav entry. */
export function PageTitle({ items }: { items: Item[] }) {
  const path = usePathname();
  const match = items.filter((i) => isOn(path, i.href)).sort((a, b) => b.href.length - a.href.length)[0];
  return <div className="min-w-0 flex-1 truncate font-display font-semibold">{match?.label ?? ""}</div>;
}

/** Below the lg breakpoint the sidebar becomes a drawer opened from the top bar. */
export function MobileNav({ items, badges, brand, school }: { items: Item[]; badges: Record<string, number>; brand: React.ReactNode; school: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button type="button" className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[10px] border border-line bg-surface lg:hidden"
        aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
        <Icon name="menu" />
      </button>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-[280px] max-w-[85vw] flex-col gap-4 overflow-y-auto bg-surface px-3 py-4 shadow-xl">
            <div className="flex items-center justify-between">{brand}<button type="button" className="btn btn-sm" aria-label="Close menu" onClick={() => setOpen(false)}><Icon name="x" /></button></div>
            {school}
            <NavLinks items={items} badges={badges} />
          </div>
        </div>
      )}
    </>
  );
}

export function UserMenu({ name, initials, sub, settingsHref, logout }: { name: string; initials: string; sub: string; settingsHref: string; logout: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative flex-none">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu for ${name}`} onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full">
        <span className="hidden text-right text-xs sm:block"><b className="block">{name}</b><span className="text-muted">{sub}</span></span>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-teal-soft font-display text-xs font-bold text-teal">{initials}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-30 flex w-60 flex-col gap-1 rounded-card border border-line bg-surface p-2 shadow-lg">
          <div className="px-2 py-1.5 text-xs sm:hidden"><b className="block text-sm">{name}</b><span className="text-muted">{sub}</span></div>
          <Link role="menuitem" href={settingsHref} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-bold hover:bg-surface-2"><Icon name="gear" /> Settings &amp; privacy</Link>
          <form action={logout}><button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-bold hover:bg-surface-2"><Icon name="logout" /> Sign out</button></form>
        </div>
      )}
    </div>
  );
}
