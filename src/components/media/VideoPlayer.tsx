"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Icon } from "@/components/icons";
import {
  blockingQuestion, fmtClock, mergeRanges, parseVtt, spokenClock, videoSources, watchedPercent,
  type Chapter, type Range, type StudentQuestion, type VideoQuestion,
} from "@/lib/recordings";

// Custom media player for recorded classes: no native controls, keyboard
// shortcuts, chapters, transcript, captions and in-video questions. Students'
// watched ranges are saved through a server action; the teacher preview saves nothing.

type Q = StudentQuestion & Partial<Pick<VideoQuestion, "answerIndex" | "explanation">>;
type Answered = Record<string, { choice: number; correct: boolean }>;
type ProgressResult = { watchedPct?: number; completed?: boolean; error?: string };
type AnswerResult = { correct?: boolean; explanation?: string; answerIndex?: number | null; completed?: boolean; error?: string };

export type VideoPlayerProps = {
  src: string;
  title: string;
  poster?: string | null;
  captionsVtt: string | null;
  captionsDefault?: boolean;
  chapters: Chapter[];
  questions: Q[];
  durationHint: number | null;
  /** "student" saves progress and blocks seeking past unanswered questions; "preview" is the teacher's view. */
  mode: "student" | "preview";
  initial?: { positionSec: number; watched: Range[]; answers: Answered; completedAt: string | null };
  onProgress?: (p: { positionSec: number; durationSec: number | null; ranges: Range[] }) => Promise<ProgressResult>;
  onAnswer?: (questionId: string, choice: number) => Promise<AnswerResult>;
};

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const SAVE_EVERY_MS = 10_000;
const SHORTCUTS: [string, string][] = [
  ["Space or K", "Play or pause"], ["J / L", "Back or forward 10 seconds"], ["← / →", "Back or forward 5 seconds"],
  ["↑ / ↓", "Volume up or down"], ["M", "Mute"], ["C", "Captions on or off"], ["F", "Full screen"], ["?", "Show these shortcuts"],
];

export function VideoPlayer(p: VideoPlayerProps) {
  const student = p.mode === "student";
  const video = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const transcriptBox = useRef<HTMLOListElement>(null);
  const questionBox = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(p.initial?.positionSec ?? 0);
  const [duration, setDuration] = useState(p.durationHint ?? 0);
  const [buffered, setBuffered] = useState<Range>([0, 0]);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [captionsOn, setCaptionsOn] = useState(p.captionsDefault ?? true);
  const [fullscreen, setFullscreen] = useState(false);
  const [pipOk, setPipOk] = useState(false);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  const [panel, setPanel] = useState<"chapters" | "transcript">(p.chapters.length ? "chapters" : "transcript");
  const [activeQ, setActiveQ] = useState<Q | null>(null);
  const [result, setResult] = useState<{ choice: number; correct: boolean; explanation: string } | null>(null);
  const [answering, setAnswering] = useState(false);
  const [answered, setAnswered] = useState<Answered>(p.initial?.answers ?? {});
  const [watched, setWatched] = useState<Range[]>(p.initial?.watched ?? []);
  const [completed, setCompleted] = useState(!!p.initial?.completedAt);
  const [status, setStatus] = useState("");
  const [resumedAt, setResumedAt] = useState<number | null>(null);
  const [error, setError] = useState(false);

  // Watching is tracked as segments: from where playback (re)started to the last time we saw.
  const segStart = useRef<number | null>(null);
  const lastT = useRef(p.initial?.positionSec ?? 0);
  const pending = useRef<Range[]>([]);
  const saving = useRef(false);
  const shown = useRef(new Set<string>()); // preview: questions already shown this play-through
  const answeredRef = useRef(answered);
  answeredRef.current = answered;

  const cues = useMemo(() => (p.captionsVtt ? parseVtt(p.captionsVtt) : []), [p.captionsVtt]);
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!p.captionsVtt) return;
    const url = URL.createObjectURL(new Blob([p.captionsVtt], { type: "text/vtt" }));
    setTrackUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [p.captionsVtt]);

  const dur = duration || p.durationHint || 0;
  const shownT = scrub ?? current;
  const questions = useMemo(() => [...p.questions].sort((a, b) => a.t - b.t), [p.questions]);
  const isAnswered = useCallback((id: string) => !!answeredRef.current[id], []);

  // ---------- Progress ----------
  const closeSegment = useCallback(() => {
    const v = video.current;
    if (segStart.current != null && lastT.current > segStart.current) {
      const r: Range = [segStart.current, lastT.current];
      pending.current.push(r);
      setWatched((w) => mergeRanges([...w, r], v?.duration || null));
    }
    segStart.current = v && !v.paused ? v.currentTime : null;
  }, []);

  // Kept in a ref so the save function is stable and safe to call from unload handlers.
  const onProgress = useRef(p.onProgress);
  onProgress.current = p.onProgress;
  const flush = useCallback(async () => {
    const v = video.current;
    if (!student || !onProgress.current || !v || saving.current) return;
    if (!v.paused) { lastT.current = v.currentTime; closeSegment(); }
    const ranges = pending.current;
    pending.current = [];
    saving.current = true;
    try {
      const r = await onProgress.current({ positionSec: Math.round(v.currentTime * 10) / 10, durationSec: Number.isFinite(v.duration) ? v.duration : null, ranges });
      if (r.error) throw new Error(r.error);
      if (r.completed) setCompleted(true);
      setStatus("Progress saved");
    } catch {
      pending.current = [...ranges, ...pending.current];
      setStatus("Couldn't save progress. We'll try again.");
    } finally { saving.current = false; }
  }, [student, closeSegment]);

  useEffect(() => {
    if (!playing || !student) return;
    const t = setInterval(() => void flush(), SAVE_EVERY_MS);
    return () => clearInterval(t);
  }, [playing, student, flush]);

  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") void flush(); };
    const leave = () => void flush();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", leave); void flush(); };
  }, [flush]);

  // ---------- Playback ----------
  const showQuestion = useCallback((q: Q) => {
    const v = video.current;
    v?.pause();
    if (v && Math.abs(v.currentTime - q.t) > 0.3) { v.currentTime = q.t; lastT.current = q.t; }
    if (!student) shown.current.add(q.id);
    setResult(null);
    setActiveQ(q);
  }, [student]);

  const seekTo = useCallback((target: number) => {
    const v = video.current;
    if (!v) return;
    let t = Math.max(0, Math.min(target, (Number.isFinite(v.duration) ? v.duration : dur) || target));
    const block = student ? blockingQuestion(questions, isAnswered, t) : null;
    lastT.current = v.currentTime;
    closeSegment();
    if (block) t = block.t;
    v.currentTime = t;
    lastT.current = t;
    setCurrent(t);
    if (!v.paused) segStart.current = t;
    if (block) { showQuestion(block); setStatus("Answer the question to keep going."); }
    if (!student) shown.current.forEach((id) => { const q = questions.find((x) => x.id === id); if (q && q.t >= t) shown.current.delete(id); });
  }, [dur, student, questions, isAnswered, closeSegment, showQuestion]);

  const toggle = useCallback(() => {
    const v = video.current;
    if (!v || activeQ) return;
    if (v.paused || v.ended) v.play().catch(() => setError(true)); else v.pause();
  }, [activeQ]);

  const skip = useCallback((d: number) => { const v = video.current; if (v) seekTo(v.currentTime + d); }, [seekTo]);
  const changeVolume = useCallback((n: number) => {
    const v = video.current; if (!v) return;
    v.volume = Math.max(0, Math.min(1, Math.round(n * 100) / 100));
    v.muted = v.volume === 0;
  }, []);
  const toggleMute = useCallback(() => { const v = video.current; if (v) { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 0.5; } }, []);

  const toggleFullscreen = useCallback(() => {
    const el = wrap.current;
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el?.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
    else v?.webkitEnterFullscreen?.(); // iPhone Safari only allows the video itself to go full screen
  }, []);

  const togglePip = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture();
    else void v.requestPictureInPicture().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    setPipOk(typeof document !== "undefined" && "pictureInPictureEnabled" in document && document.pictureInPictureEnabled);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Captions: the track's cues render on the video; the toggle shows or hides them.
  useEffect(() => {
    const t = video.current?.textTracks[0];
    if (t) t.mode = captionsOn ? "showing" : "hidden";
  }, [captionsOn, trackUrl]);

  // Focus the first answer when a question appears.
  useEffect(() => { if (activeQ) questionBox.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [activeQ]);

  // Runs once the video's length is known. The browser may load metadata before
  // React hydrates and misses the event, so it's also checked on mount.
  const ready = useRef(false);
  const metadataReady = () => {
    const v = video.current;
    if (!v || ready.current) return;
    ready.current = true;
    if (Number.isFinite(v.duration)) setDuration(v.duration);
    const start = p.initial?.positionSec ?? 0;
    if (student && start > 1 && start < v.duration - 2) { v.currentTime = start; lastT.current = start; setCurrent(start); setResumedAt(start); }
    setVolume(v.volume); setMuted(v.muted);
  };
  useEffect(() => { if ((video.current?.readyState ?? 0) >= 1) metadataReady(); });

  // Error events from a <source> the browser skipped (e.g. no H.264) also reach the
  // video in React, so only show the message when nothing is playable.
  const checkError = () => setTimeout(() => {
    const v = video.current;
    if (v && (v.error || v.networkState === HTMLMediaElement.NETWORK_NO_SOURCE)) setError(true);
  }, 0);

  const events = {
    onLoadedMetadata: () => metadataReady(),
    onDurationChange: () => { const v = video.current!; if (Number.isFinite(v.duration)) setDuration(v.duration); },
    onPlay: () => { const v = video.current!; setPlaying(true); setError(false); segStart.current = v.currentTime; lastT.current = v.currentTime; },
    onPause: () => { const v = video.current!; lastT.current = v.currentTime; closeSegment(); setPlaying(false); void flush(); },
    onEnded: () => { const v = video.current!; lastT.current = v.currentTime; closeSegment(); setPlaying(false); void flush(); },
    onTimeUpdate: () => {
      const v = video.current!;
      const t = v.currentTime, prev = lastT.current;
      // A jump we didn't make ourselves (e.g. the browser's own controls) starts a new segment.
      if (segStart.current != null && (t < prev - 0.5 || t > prev + 2.5)) { closeSegment(); segStart.current = t; }
      lastT.current = t;
      setCurrent(t);
      if (!v.paused && !activeQ && t - prev < 2.5) {
        const q = questions.find((x) => x.t >= prev - 0.05 && x.t <= t + 0.05 && (student ? !answeredRef.current[x.id] : !shown.current.has(x.id)));
        if (q) showQuestion(q);
      }
    },
    onProgress: () => {
      const v = video.current!, b = v.buffered;
      for (let i = 0; i < b.length; i++) if (b.start(i) <= v.currentTime + 0.5 && b.end(i) >= v.currentTime) return setBuffered([b.start(i), b.end(i)]);
      if (b.length) setBuffered([b.start(b.length - 1), b.end(b.length - 1)]);
    },
    onVolumeChange: () => { const v = video.current!; setVolume(v.volume); setMuted(v.muted); },
    onRateChange: () => setRate(video.current!.playbackRate),
    onError: checkError,
  };

  // ---------- Questions ----------
  async function answer(choice: number) {
    if (!activeQ || answering) return;
    if (!student) {
      const correct = choice === activeQ.answerIndex;
      setResult({ choice, correct, explanation: activeQ.explanation ?? "" });
      return;
    }
    setAnswering(true);
    try {
      const r = await p.onAnswer?.(activeQ.id, choice);
      if (!r || r.error || r.correct == null) { setStatus(r?.error ?? "That answer couldn't be saved. Try again."); return; }
      setAnswered((a) => ({ ...a, [activeQ.id]: { choice, correct: r.correct! || !!a[activeQ.id]?.correct } }));
      setResult({ choice, correct: r.correct, explanation: r.explanation ?? "" });
      if (r.completed) setCompleted(true);
    } finally { setAnswering(false); }
  }
  function continuePlaying() {
    setActiveQ(null); setResult(null);
    video.current?.play().catch(() => setError(true));
    wrap.current?.focus();
  }

  // ---------- Keyboard ----------
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target as HTMLElement).tagName;
    const field = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
    if (activeQ && e.key !== "f") return;
    switch (e.key) {
      case " ": if (tag === "BUTTON" || field) return; toggle(); break;
      case "k": case "K": toggle(); break;
      case "j": case "J": skip(-10); break;
      case "l": case "L": skip(10); break;
      case "ArrowLeft": if (field) return; skip(-5); break;
      case "ArrowRight": if (field) return; skip(5); break;
      case "ArrowUp": if (field) return; changeVolume((video.current?.volume ?? 1) + 0.1); break;
      case "ArrowDown": if (field) return; changeVolume((video.current?.volume ?? 1) - 0.1); break;
      case "m": case "M": toggleMute(); break;
      case "c": case "C": if (cues.length) setCaptionsOn((c) => !c); break;
      case "f": case "F": toggleFullscreen(); break;
      case "?": setHelp((h) => !h); break;
      default: return;
    }
    e.preventDefault();
  }
  function onBarKey(e: KeyboardEvent<HTMLDivElement>) {
    const step: Record<string, number> = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -5, ArrowUp: 5, PageDown: -10, PageUp: 10 };
    if (e.key in step) seekTo(current + step[e.key]);
    else if (e.key === "Home") seekTo(0);
    else if (e.key === "End") seekTo(dur);
    else return;
    e.preventDefault(); e.stopPropagation();
  }

  // ---------- Seek bar pointer ----------
  const timeAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - r.left, r.width));
    return { x, t: r.width ? (x / r.width) * dur : 0 };
  };
  const pointer = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => { if (!dur) return; e.currentTarget.setPointerCapture(e.pointerId); setScrub(timeAt(e.clientX).t); },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => { if (!dur) return; const h = timeAt(e.clientX); setHover(h); if (scrub != null) setScrub(h.t); },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => { if (scrub == null) return; seekTo(timeAt(e.clientX).t); setScrub(null); },
    onPointerCancel: () => setScrub(null),
    onPointerLeave: () => setHover(null),
  };

  const pct = (t: number) => (dur ? `${Math.max(0, Math.min(100, (t / dur) * 100))}%` : "0%");
  const chapterAt = (t: number) => [...p.chapters].reverse().find((c) => c.t <= t + 0.01);
  const activeChapter = chapterAt(current);
  const activeCue = cues.findIndex((c) => current >= c.start && current < c.end);
  const myPct = watchedPercent(watched, dur);

  // Keep the active transcript line in view inside its own panel (never scrolls the page).
  useEffect(() => {
    const box = transcriptBox.current;
    const el = box?.querySelector<HTMLElement>('[aria-current="true"]');
    if (box && el) box.scrollTop = el.offsetTop - box.offsetTop - box.clientHeight / 3;
  }, [activeCue, panel]);

  const btn = "grid h-9 w-9 flex-none place-items-center rounded-lg hover:bg-surface-2 aria-pressed:bg-brand-soft aria-pressed:text-brand";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div ref={wrap} tabIndex={-1} onKeyDown={onKey} role="region" aria-label={`Video player: ${p.title}`}
        className={`flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-black ${fullscreen ? "h-full justify-center rounded-none border-0" : ""}`}>
        <div className={`relative ${fullscreen ? "min-h-0 flex-1" : ""}`}>
          <video ref={video} poster={p.poster ?? undefined} preload="metadata" playsInline
            className={`block w-full bg-black ${fullscreen ? "h-full" : "aspect-video"}`} onClick={toggle} {...events}>
            {videoSources(p.src).map((x, i, all) => <source key={x.src} src={x.src} type={x.type} onError={i === all.length - 1 ? checkError : undefined} />)}
            {trackUrl && <track kind="captions" srcLang="en" label="English" src={trackUrl} />}
          </video>
          {!playing && !activeQ && !error && (
            <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-3xl text-white"><Icon name="play" /></span>
          )}
          {error && <p role="alert" className="absolute inset-x-3 top-3 rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">The video couldn&apos;t play. Check your connection, or ask your teacher if the link still works.</p>}
          {activeQ && (
            <div className="relative bg-surface p-3 sm:absolute sm:inset-0 sm:grid sm:place-items-center sm:bg-black/70">
              <div ref={questionBox} role="dialog" aria-modal="false" aria-labelledby="vq-prompt" className="flex w-full max-w-md flex-col gap-3 rounded-lg bg-surface p-4 sm:max-h-full sm:overflow-y-auto">
                <div className="eyebrow">Question at {fmtClock(activeQ.t)}</div>
                <h3 id="vq-prompt" className="text-lg">{activeQ.prompt}</h3>
                <div className="flex flex-col gap-2">
                  {activeQ.options.map((o, i) => {
                    const picked = result?.choice === i;
                    const tone = picked ? (result!.correct ? "border-good bg-good-soft" : "border-bad bg-bad-soft") : "";
                    return <button key={i} type="button" className={`btn justify-start text-left ${tone}`} disabled={!!result || answering} aria-pressed={picked} onClick={() => answer(i)}>{o}</button>;
                  })}
                </div>
                {result && (
                  <div role="status" className={`rounded-lg px-3 py-2 text-sm ${result.correct ? "bg-good-soft" : "bg-warn-soft"}`}>
                    <b className={result.correct ? "text-good" : "text-warn"}>{result.correct ? "Correct!" : "Not quite."}</b>{result.explanation && <> {result.explanation}</>}
                  </div>
                )}
                {result && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-primary" onClick={continuePlaying}>Continue</button>
                    {!result.correct && <button type="button" className="btn" onClick={() => setResult(null)}>Try again</button>}
                  </div>
                )}
                {!student && <p className="text-xs text-muted">Preview: answers aren&apos;t saved.</p>}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 bg-surface px-3 pb-2 pt-3">
          {/* Seek bar: buffered, watched-so-far, chapter ticks, question dots and a hover time. */}
          <div ref={bar} role="slider" tabIndex={0} aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(shownT)}
            aria-valuetext={`${spokenClock(shownT)} of ${spokenClock(dur)}${activeChapter ? `, ${activeChapter.title}` : ""}`}
            onKeyDown={onBarKey} {...pointer} className="relative h-5 cursor-pointer touch-none select-none">
            <div className="absolute inset-x-0 top-2 h-1.5 rounded-full bg-surface-2">
              <div className="absolute inset-y-0 rounded-full bg-line" style={{ left: pct(buffered[0]), width: `calc(${pct(buffered[1])} - ${pct(buffered[0])})` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: pct(shownT) }} />
              {p.chapters.filter((c) => c.t > 0).map((c) => <span key={c.t} className="absolute inset-y-0 w-0.5 bg-surface" style={{ left: pct(c.t) }} />)}
            </div>
            {questions.map((q) => (
              <span key={q.id} title="Question" className={`absolute top-1 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-surface ${answered[q.id] ? "bg-good" : "bg-warn"}`} style={{ left: pct(q.t) }} />
            ))}
            <span className="absolute top-0.5 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-surface bg-brand shadow" style={{ left: pct(shownT) }} />
            {hover && (
              <span className="tnum pointer-events-none absolute bottom-6 -translate-x-1/2 whitespace-nowrap rounded bg-fg px-1.5 py-0.5 text-xs text-bg" style={{ left: Math.max(24, Math.min(hover.x, (bar.current?.clientWidth ?? 0) - 24)) }}>
                {fmtClock(hover.t)}{chapterAt(hover.t) ? ` · ${chapterAt(hover.t)!.title}` : ""}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1 text-fg">
            <button type="button" className={btn} onClick={toggle} aria-label={playing ? "Pause" : "Play"} disabled={!!activeQ}><Icon name={playing ? "pause" : "play"} /></button>
            <button type="button" className={btn} onClick={() => skip(-10)} aria-label="Back 10 seconds"><Icon name="rewind" /></button>
            <button type="button" className={btn} onClick={() => skip(10)} aria-label="Forward 10 seconds"><Icon name="forward" /></button>
            <span className="tnum px-1 text-xs"><span className="sr-only">Time </span>{fmtClock(shownT)} / {fmtClock(dur)}</span>
            <span className="flex-1" />
            <button type="button" className={btn} onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted}><Icon name={muted || volume === 0 ? "mute" : "volume"} /></button>
            <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => changeVolume(Number(e.target.value))}
              aria-label="Volume" aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)}%`} className="w-16 accent-[rgb(var(--blue))] sm:w-20" />
            <label className="sr-only" htmlFor="vp-speed">Playback speed</label>
            <select id="vp-speed" className="rounded-lg border border-line bg-surface px-1.5 py-1 text-xs font-bold" value={rate}
              onChange={(e) => { if (video.current) video.current.playbackRate = Number(e.target.value); }}>
              {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
            </select>
            {cues.length > 0 && <button type="button" className={btn} onClick={() => setCaptionsOn((c) => !c)} aria-label="Captions" aria-pressed={captionsOn}><Icon name="cc" /></button>}
            {pipOk && <button type="button" className={btn} onClick={togglePip} aria-label="Picture in picture"><Icon name="pip" /></button>}
            <button type="button" className={btn} onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"}><Icon name={fullscreen ? "shrink" : "expand"} /></button>
            <button type="button" className={btn} onClick={() => setHelp((h) => !h)} aria-label="Keyboard shortcuts" aria-expanded={help}><Icon name="keyboard" /></button>
          </div>

          {help && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-surface-2 p-3 text-xs" aria-label="Keyboard shortcuts">
              {SHORTCUTS.map(([k, d]) => <div key={k} className="contents"><dt className="font-bold">{k}</dt><dd>{d}</dd></div>)}
              <dd className="col-span-2 text-muted">Shortcuts work while the player has focus. Click the video or press Tab to reach it.</dd>
            </dl>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" aria-live="polite">
            {student && <span>Watched <b className="tnum text-fg">{myPct}%</b>{completed ? " · Completed" : ""}</span>}
            {resumedAt != null && current < resumedAt + 30 && (
              <span>Resumed at {fmtClock(resumedAt)} · <button type="button" className="font-bold text-brand underline" onClick={() => { setResumedAt(null); seekTo(0); }}>Start from the beginning</button></span>
            )}
            {status && <span>{status}</span>}
          </div>
        </div>
      </div>

      <aside className="card self-start" aria-label="Chapters and transcript">
        <div role="tablist" aria-label="Chapters and transcript" className="flex gap-1 rounded-lg bg-surface-2 p-1">
          {(["chapters", "transcript"] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={panel === k} aria-controls={`vp-${k}`} id={`vp-tab-${k}`} onClick={() => setPanel(k)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-bold ${panel === k ? "bg-surface shadow-sm" : "text-muted"}`}>
              {k === "chapters" ? "Chapters" : "Transcript"}
            </button>
          ))}
        </div>
        {panel === "chapters" ? (
          <div id="vp-chapters" role="tabpanel" aria-labelledby="vp-tab-chapters">
            {p.chapters.length === 0 ? <p className="text-sm text-muted">No chapters for this video.</p> : (
              <ol className="flex flex-col gap-1">
                {p.chapters.map((c) => (
                  <li key={c.t}>
                    <button type="button" onClick={() => seekTo(c.t)} aria-current={activeChapter === c ? "true" : undefined}
                      className={`flex w-full items-baseline gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2 ${activeChapter === c ? "bg-brand-soft font-bold text-brand" : ""}`}>
                      <span className="tnum w-12 flex-none text-xs text-muted">{fmtClock(c.t)}</span><span>{c.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {questions.length > 0 && <p className="mt-2 text-xs text-muted">{questions.length} question{questions.length === 1 ? "" : "s"} in this video (the dots on the timeline).{student ? " Answer each one to keep watching." : ""}</p>}
          </div>
        ) : (
          <div id="vp-transcript" role="tabpanel" aria-labelledby="vp-tab-transcript">
            {cues.length === 0 ? <p className="text-sm text-muted">No transcript for this video.</p> : (
              <ol ref={transcriptBox} className="relative flex max-h-80 flex-col gap-0.5 overflow-y-auto">
                {cues.map((c, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => seekTo(c.start)} aria-current={i === activeCue ? "true" : undefined}
                      className={`flex w-full gap-3 rounded-lg px-2 py-1 text-left text-sm hover:bg-surface-2 ${i === activeCue ? "bg-brand-soft text-brand" : ""}`}>
                      <span className="tnum w-12 flex-none text-xs text-muted">{fmtClock(c.start)}</span><span>{c.text}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
