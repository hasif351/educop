import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

const DEMO = [
  ["Student", "layla@crescentbay.example"],
  ["Teacher", "sara.mitchell@crescentbay.example"],
  ["Parent", "rania.hassan@example.com"],
  ["School admin", "admin@crescentbay.example"],
  ["Platform admin", "platform@educop.example"],
  ["Teacher, second school", "omar.farouk@palmgrove.example"],
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const showDemo = process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_ACCOUNTS === "true";
  return (
    <div className="grid min-h-screen lg:grid-cols-[5fr_7fr]">
      <section className="flex flex-col justify-between gap-8 bg-gradient-to-br from-[#0F3E8A] to-[#0A6F73] p-8 text-white sm:p-10">
        <div className="flex items-center gap-2 font-display text-xl font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/20">E</span>Educop
        </div>
        <div className="flex max-w-md flex-col gap-3">
          <h1 className="text-3xl text-white">One place for every learner from KG to Grade 12.</h1>
          <p className="opacity-85">Daily lessons, assignments and progress for students, teachers and families.</p>
        </div>
        <p className="text-xs opacity-75">MVP build · all demo data is fictional</p>
      </section>
      <section className="mx-auto flex w-full max-w-lg flex-col justify-center gap-6 p-6 sm:p-10">
        <div>
          <h2 className="text-2xl">Sign in</h2>
          <p className="text-muted">Use the account your school gave you.</p>
        </div>
        <LoginForm next={next} />
        {showDemo && (
          <div className="card">
            <div className="eyebrow">Demo accounts · password: Educop!2026</div>
            <ul className="flex flex-col gap-1 text-sm">
              {DEMO.map(([r, e]) => (
                <li key={e} className="flex flex-wrap justify-between gap-2"><span className="text-muted">{r}</span><code className="select-all">{e}</code></li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
