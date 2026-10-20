import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-start justify-center gap-3 p-6">
      <h1 className="text-2xl">Page not found</h1>
      <p className="text-muted">It may have moved, or it belongs to a class or school you don&apos;t have access to.</p>
      <Link className="btn-primary" href="/">Go to my dashboard</Link>
    </main>
  );
}
