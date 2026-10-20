"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ARROWS, adapt, generateItem, type AdaptState, type Answer, type Domain } from "@/lib/cognitive";
import { finishPractice, startPractice, type FinishResult } from "../actions";

type Started = { id: string; seed: string; gradeLevel: number | null };
type Phase = "intro" | "memo" | "question" | "feedback" | "saving" | "done";

const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
const arrowName = (a: string) => ["up", "up and right", "right", "down and right", "down", "down and left", "left", "up and left"][ARROWS.indexOf(a)] ?? a;

export function PracticePlayer({ domain, label, count, level, young }: { domain: Domain; label: string; count: number; level: number; young: boolean }) {
  const [session, setSession] = useState<Started | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [state, setState] = useState<AdaptState>({ level, run: 0 });
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [choice, setChoice] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const qStart = useRef(0);
  const pauseStart = useRef(0);
  const promptRef = useRef<HTMLHeadingElement>(null);

  const item = useMemo(() => (session ? generateItem(domain, session.gradeLevel, session.seed, index, state.level) : null), [session, domain, index, state.level]);
  const playing = phase === "memo" || phase === "question" || phase === "feedback";

  // Session clock, paused during breaks.
  useEffect(() => {
    if (!playing || paused) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [playing, paused]);

  function showItem() {
    qStart.current = performance.now();
    setPhase("question");
    setTimeout(() => promptRef.current?.focus(), 0);
  }

  function begin() {
    setError(null);
    start(async () => {
      try {
        const s = await startPractice(domain);
        setSession({ id: s.id, seed: s.seed, gradeLevel: s.gradeLevel });
        setState({ level: s.level, run: 0 });
        const first = generateItem(domain, s.gradeLevel, s.seed, 0, s.level);
        if (first.memo) setPhase("memo"); else showItem();
      } catch {
        setError("Couldn't start the practice set. Check your connection and try again.");
      }
    });
  }

  function answer(i: number) {
    if (!item || phase !== "question" || paused) return;
    setChoice(i);
    setAnswers((a) => [...a, { choice: i, ms: Math.round(performance.now() - qStart.current) }]);
    setPhase("feedback");
  }

  function next() {
    if (!item || !session) return;
    const nextState = adapt(state, choice === item.answerIndex);
    if (index + 1 >= count) return finish(answers);
    setState(nextState);
    setIndex(index + 1);
    setChoice(null);
    const upcoming = generateItem(domain, session.gradeLevel, session.seed, index + 1, nextState.level);
    if (upcoming.memo) setPhase("memo"); else showItem();
  }

  function finish(list: Answer[]) {
    if (!session || list.length === 0) return;
    setPhase("saving");
    setError(null);
    start(async () => {
      const r = await finishPractice({ sessionId: session.id, answers: list }).catch(() => ({ error: "Couldn't save your practice. Check your connection and try again." }));
      if ("error" in r) { setError(r.error); setPhase(choice == null ? "question" : "feedback"); return; }
      setResult(r);
      setPhase("done");
    });
  }

  function togglePause() {
    if (!paused) { pauseStart.current = performance.now(); setPaused(true); return; }
    qStart.current += performance.now() - pauseStart.current;
    setPaused(false);
  }

  if (phase === "intro") {
    return (
      <section className="card max-w-2xl" aria-labelledby="intro-h">
        <h2 id="intro-h" className="text-lg">Ready when you are</h2>
        <p>{young ? "A few short puzzles. A grown-up can read the questions aloud." : `${count} puzzles, one at a time.`} There&apos;s a clock so you can see how long you&apos;ve been going, but no time limit. You can take a break whenever you like.</p>
        {error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{error}</p>}
        <button className="btn-primary self-start" onClick={begin} disabled={pending}>{pending ? "Getting puzzles…" : `Start ${label.toLowerCase()} practice`}</button>
      </section>
    );
  }

  if (phase === "done" && result && !("error" in result)) {
    const up = result.endLevel > result.startLevel;
    return (
      <section className="card max-w-2xl" aria-labelledby="done-h">
        <h2 id="done-h" className="text-xl" tabIndex={-1}>Practice saved</h2>
        <p role="status">You solved <b>{result.correct} of {result.total}</b> puzzles. {result.correct >= result.total / 2 ? "Nice focus!" : "Every set helps your brain practise."}</p>
        <p className="rounded-lg bg-teal-soft px-3 py-2 text-sm">{result.growth}{up ? " The puzzles got harder as you went, which means you were ready for more." : ""}</p>
        <p className="text-sm font-bold text-good">+{result.points} points for finishing</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => { setSession(null); setIndex(0); setAnswers([]); setChoice(null); setElapsed(0); setState({ level: result.endLevel, run: 0 }); setResult(null); setPhase("intro"); }}>Practise again</button>
          <Link className="btn" href="/student/skills#growth">See my growth</Link>
        </div>
      </section>
    );
  }

  if (!item) return null;
  const correct = choice === item.answerIndex;
  return (
    <section className="card max-w-3xl gap-4" aria-label={`${label} practice`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="chip bg-brand-soft text-brand">{label}</span>
        <span className="text-muted">Puzzle {index + 1} of {count} · Level {item.level}</span>
        <span className="tnum text-muted" aria-label={`Time so far ${fmtClock(elapsed)}`}>⏱ {fmtClock(elapsed)}</span>
      </div>
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => <i key={i} className={`h-1.5 flex-1 rounded-full ${i < index ? "bg-teal" : i === index ? "bg-brand" : "bg-surface-2"}`} />)}
      </div>

      {paused ? (
        <div className="flex flex-col items-start gap-2 rounded-lg bg-surface-2 p-6">
          <h2 className="text-lg">Taking a break</h2>
          <p className="text-sm text-muted">Your puzzle is hidden and the clock is stopped. Come back when you&apos;re ready.</p>
        </div>
      ) : phase === "memo" ? (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <h2 className="text-lg">Remember these numbers</h2>
          <p className="font-display text-4xl font-bold tracking-[0.3em]" aria-label={`Numbers: ${item.memo!.join(", ")}`}>{item.memo!.join(" ")}</p>
          <button className="btn-primary" onClick={showItem}>I&apos;m ready</button>
        </div>
      ) : (
        <>
          <h2 ref={promptRef} tabIndex={-1} className="text-lg">{item.prompt}</h2>
          {item.figure && (
            <p className="flex flex-wrap gap-3 font-display text-3xl font-bold"
              aria-label={`Sequence: ${item.figure.map((f) => (f === "?" ? "question mark" : ARROWS.includes(f) ? arrowName(f) : f)).join(", ")}`}>
              {item.figure.map((f, i) => <span key={i} aria-hidden="true">{f}</span>)}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Answer options">
            {item.options.map((o, i) => {
              const cls = phase !== "feedback" ? "hover:border-brand" : i === item.answerIndex ? "border-good bg-good-soft" : i === choice ? "border-bad bg-bad-soft" : "opacity-60";
              return (
                <button key={i} type="button" onClick={() => answer(i)} disabled={phase !== "question"} aria-label={item.optionLabels?.[i]}
                  className={`rounded-lg border border-line px-3 py-3 text-left font-bold ${item.figure && !/\d/.test(o) ? "text-center text-2xl" : ""} ${cls}`}>
                  {o}
                </button>
              );
            })}
          </div>
          <div aria-live="polite">
            {phase === "feedback" && (
              <p className={`rounded-lg px-3 py-2 text-sm ${correct ? "bg-teal-soft" : "bg-warn-soft"}`}>
                {correct ? "Nice thinking!" : `Good try. The answer was ${item.optionLabels?.[item.answerIndex] ?? item.options[item.answerIndex]}.`}
              </p>
            )}
          </div>
        </>
      )}

      {error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{error}</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {phase === "feedback" && !paused && (
          <button className="btn-primary" onClick={next} disabled={pending}>{index + 1 >= count ? "See how I did" : "Next puzzle"}</button>
        )}
        {phase === "saving" && <span role="status" className="text-sm text-muted">Saving…</span>}
        <button className="btn" onClick={togglePause} disabled={phase === "saving"}>{paused ? "Keep going" : "Take a break"}</button>
        {answers.length > 0 && phase !== "saving" && (
          <button className="btn ml-auto" onClick={() => finish(answers)} disabled={pending}>Finish now</button>
        )}
      </div>
    </section>
  );
}
