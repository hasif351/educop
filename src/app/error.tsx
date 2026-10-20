"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-start justify-center gap-3 p-6">
      <h1 className="text-2xl">Something went wrong</h1>
      <p className="text-muted">The page couldn&apos;t load. Your work so far is saved. Try again, and contact your school if it keeps happening.</p>
      <button className="btn-primary" onClick={reset}>Try again</button>
    </main>
  );
}
