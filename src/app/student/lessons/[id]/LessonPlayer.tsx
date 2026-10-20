"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { completeLessonStep } from "@/app/student/actions";

export type KCItem = { prompt: string; options: string[]; answerIndex: number; hint?: string; explanation?: string };
type Content = {
  objectives: string[]; introduction: string; explanation: string; activity: string;
  knowledgeCheck: KCItem[]; worksheet: string; nextActivity: string; assignments: { id: string; title: string }[];
};

const STEPS = ["Learning objectives", "Introduction", "Explanation & examples", "Interactive activity", "Knowledge check", "Practice worksheet", "Assessment", "Recommended next"];

export function LessonPlayer({ lessonId, initialDone, content }: { lessonId: string; initialDone: number[]; content: Content }) {
  const [done, setDone] = useState<number[]>(initialDone);
  const [step, setStep] = useState(() => { const firstOpen = STEPS.findIndex((_, i) => !initialDone.includes(i)); return firstOpen === -1 ? 0 : firstOpen; });
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pct = Math.round((done.length / 8) * 100);

  function markDone() {
    setError(null);
    const kc = content.knowledgeCheck;
    const extra = step === 4 && kc.length ? { correct: kc.filter((q, i) => answers[i] === q.answerIndex).length, total: kc.length } : {};
    start(async () => {
      try {
        const r = await completeLessonStep({ lessonId, step, ...extra });
        setDone(r.steps);
        if (step < 7) setStep(step + 1);
      } catch {
        setError("Couldn't save your progress. Check your connection and try again.");
      }
    });
  }

  const para = (t: string) => t.split("\n").filter(Boolean).map((x, i) => <p key={i}>{x}</p>);
  let body: React.ReactNode;
  switch (step) {
    case 0: body = <><h2 className="text-xl">What you will learn</h2><ul className="flex list-disc flex-col gap-2 pl-5">{content.objectives.map((o) => <li key={o}>{o}</li>)}</ul></>; break;
    case 1: body = <><h2 className="text-xl">Introduction</h2>{para(content.introduction)}</>; break;
    case 2: body = <><h2 className="text-xl">Explanation & examples</h2>{para(content.explanation)}</>; break;
    case 3: body = <><h2 className="text-xl">Try it</h2>{para(content.activity)}<p className="text-sm text-muted">Do this activity in class or at home, then mark it done.</p></>; break;
    case 4: body = (
      <>
        <h2 className="text-xl">Quick check</h2>
        {content.knowledgeCheck.length === 0 && <p className="text-muted">No questions for this lesson.</p>}
        {content.knowledgeCheck.map((q, qi) => {
          const a = answers[qi];
          const answered = a !== undefined;
          return (
            <fieldset key={qi} className="flex flex-col gap-2">
              <legend className="mb-2 font-bold">{qi + 1}. {q.prompt}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {q.options.map((o, oi) => {
                  const cls = !answered ? "hover:border-brand" : oi === q.answerIndex ? "border-good bg-good-soft" : a === oi ? "border-bad bg-bad-soft" : "opacity-60";
                  return <button key={oi} type="button" disabled={answered} onClick={() => setAnswers({ ...answers, [qi]: oi })} className={`rounded-lg border border-line px-3 py-2.5 text-left font-bold ${cls}`}>{o}</button>;
                })}
              </div>
              {!answered && q.hint && <details className="text-sm"><summary className="cursor-pointer text-muted">Need a hint?</summary>{q.hint}</details>}
              {answered && <p className={`rounded-lg px-3 py-2 text-sm ${a === q.answerIndex ? "bg-teal-soft" : "bg-warn-soft"}`}>{a === q.answerIndex ? "Correct. " : "Good try. "}{q.explanation}</p>}
            </fieldset>
          );
        })}
      </>
    ); break;
    case 5: body = <><h2 className="text-xl">Practice worksheet</h2>{content.worksheet ? <pre className="whitespace-pre-wrap rounded-lg bg-surface-2 p-4 font-sans text-sm">{content.worksheet}</pre> : <p className="text-muted">No worksheet for this lesson.</p>}</>; break;
    case 6: body = <><h2 className="text-xl">Assessment</h2>{content.assignments.length ? <ul className="flex flex-col gap-2">{content.assignments.map((a) => <li key={a.id}><Link className="btn-primary" href={`/student/assignments/${a.id}`}>Open: {a.title}</Link></li>)}</ul> : <p className="text-muted">Your teacher hasn&apos;t linked an assessment to this lesson.</p>}</>; break;
    default: body = <><h2 className="text-xl">What&apos;s next</h2>{para(content.nextActivity || "Check your dashboard for recommended activities.")}<Link className="btn self-start" href="/student">Back to dashboard</Link></>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav className="card self-start p-3" aria-label="Lesson steps">
        <div className="mb-1 flex items-center gap-2 px-2 text-xs"><div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-teal" style={{ width: `${pct}%` }} /></div><b className="tnum">{pct}%</b></div>
        {STEPS.map((t, i) => (
          <button key={t} onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm font-bold ${i === step ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2"}`}>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-xs ${done.includes(i) ? "border-teal bg-teal text-white" : "border-line"}`}>{done.includes(i) ? "✓" : i + 1}</span>{t}
          </button>
        ))}
      </nav>
      <section className="card gap-4 leading-relaxed">
        {body}
        {error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{error}</p>}
        <div className="mt-2 flex items-center justify-between border-t border-line pt-4">
          <button className="btn" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>Back</button>
          <span className="text-xs text-muted">Step {step + 1} of 8</span>
          <button className="btn-primary" onClick={markDone} disabled={pending}>
            {pending ? "Saving…" : done.includes(step) ? (step === 7 ? "Done" : "Next") : step === 7 ? "Finish lesson" : "Mark done & continue"}
          </button>
        </div>
      </section>
    </div>
  );
}
