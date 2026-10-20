"use client";
import { useState, useTransition } from "react";

/** A button that runs one bound server action, with an optional confirm step. */
export function ActionButton({ action, children, className = "btn btn-sm", confirm, label }: {
  action: () => Promise<unknown>; children: React.ReactNode; className?: string; confirm?: string; label?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" className={className} disabled={pending} aria-label={label}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(null);
          start(async () => { try { await action(); } catch { setError("That didn't work. Reload and try again."); } });
        }}>
        {children}
      </button>
      {error && <span role="alert" className="text-xs font-bold text-bad">{error}</span>}
    </>
  );
}
