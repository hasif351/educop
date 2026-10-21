"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { LiveState } from "@/lib/live";
import { Icon } from "@/components/icons";
import { createPoll, endLive, lowerHand, moderateChat, setPollOpen, setSpeaking, teacherChat } from "@/app/teacher/live/actions";
import { joinLive, setHand, studentChat, votePoll } from "@/app/student/live/actions";
import { PROVIDER_LABEL, type VideoProvider } from "@/lib/live-utils";
import { EducopStage } from "./EducopStage";

const POLL_MS = 5000;
const PRESETS = [
  { q: "Is 2/4 the same as 1/2?", o: ["Yes", "No", "Not sure"] },
  { q: "How confident do you feel? (1–4)", o: ["1", "2", "3", "4"] },
];

/**
 * The live classroom for teacher and student. Video is Educop live (our own
 * stage on LiveKit), Microsoft Teams or Google Meet (opened in its own tab) or
 * the embedded Jitsi room; attendance, hands, chat and polls are ours and
 * refresh by polling every 5 s.
 */
export function LiveRoom({ id, role, title, className, host, video, initial, uploadEnabled = false }: {
  id: string; role: "TEACHER" | "STUDENT"; title: string; className: string; host: string; video: { provider: VideoProvider; url: string }; initial: LiveState;
  /** Teacher, Educop live: Vercel Blob is connected, so browser recordings upload straight away. */
  uploadEnabled?: boolean;
}) {
  const T = role === "TEACHER";
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [panel, setPanel] = useState<"people" | "chat" | "poll">(T ? "people" : "chat");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [recordingBusy, setRecordingBusy] = useState(false);
  const joined = useRef(initial.me.joined);
  joined.current = state.me.joined;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/live/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ beat: !T && joined.current }) });
      if (!res.ok) return;
      const next: LiveState = await res.json();
      setState(next);
      if (next.status === "ENDED") router.refresh();
    } catch { /* offline for a moment: the next tick retries */ }
  }, [id, T, router]);

  useEffect(() => {
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const act = (fn: () => Promise<unknown>) => start(async () => { await fn(); await refresh(); });
  const live = state.status === "LIVE";
  const showVideo = live && (T || state.me.joined);
  const hands = state.people.filter((p) => p.hand).length;
  const openPoll = state.polls.find((p) => p.open);
  const educop = video.provider === "educop";
  const external = video.provider === "teams" || video.provider === "meet";
  const service = PROVIDER_LABEL[video.provider];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">Virtual classroom · {className}</div>
          <h1 className="text-2xl">{title}</h1>
          <p className="text-sm text-muted">Host: {host}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {live ? <span className="chip bg-bad-soft text-bad"><span className="h-2 w-2 rounded-full bg-bad" aria-hidden="true" /> Live</span> : <span className="chip">Not started</span>}
          {live && state.startedAt && <Timer since={state.startedAt} />}
          {!T && state.me.joined && live && (
            <button className={state.me.hand ? "btn-primary" : "btn"} aria-pressed={state.me.hand} disabled={pending} onClick={() => act(() => setHand(id, !state.me.hand))}>
              <Icon name="hand" /> {state.me.hand ? "Lower hand" : "Raise hand"}
            </button>
          )}
          {T && live && <button className="btn border-bad text-bad" disabled={pending || recordingBusy} title={recordingBusy ? "Stop the recording and let it finish uploading first" : undefined}
            onClick={() => { if (confirm("End the class for everyone?")) act(() => endLive(id)); }}><Icon name="door" /> End class</button>}
          {!T && <Link className="btn" href="/student/live"><Icon name="door" /> Leave</Link>}
        </div>
      </div>

      <p className="flex gap-2 rounded-lg bg-warn-soft p-3 text-sm"><Icon name="info" className="mt-0.5 text-warn" />
        <span>{educop
          ? `Video runs in Educop live (beta). ${T ? "Students watch and listen; invite a student to speak from People." : "Your teacher can invite you to speak; turning your camera on is always optional."} Attendance, hands, chat and polls are stored by Educop.`
          : external
          ? `Video runs in ${service} and opens in a new tab. Keep this page open for hands, chat and polls. Attendance is recorded when you join from here. Turning your camera on is always optional.`
          : "Video runs on the free public Jitsi Meet service for this pilot, so calls may be time-limited and the host may be asked to sign in to Jitsi. Attendance, hands, chat and polls are stored by Educop. Turning your camera on is always optional."}</span>
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-3">
          {showVideo && educop ? (
            <EducopStage id={id} role={role} title={title} uploadEnabled={uploadEnabled} onBusy={setRecordingBusy}
              names={T ? Object.fromEntries(state.people.map((p) => [p.id, p.name])) : undefined} />
          ) : showVideo && external ? (
            <div className="grid aspect-video w-full place-items-center rounded-card border border-line bg-[#1A2B3D] p-6 text-center text-white">
              <div className="flex flex-col items-center gap-3">
                <b className="text-lg">{T ? `Your class is open in ${service}` : `You're in class`}</b>
                <a className="btn-primary" href={video.url} target="_blank" rel="noopener noreferrer">Open {service} <Icon name="video" /></a>
                <span className="text-xs opacity-80">Opens in a new tab. Come back here for chat and polls.</span>
              </div>
            </div>
          ) : showVideo ? (
            <iframe src={video.url} title={`Video for ${title}`} className="aspect-video w-full rounded-card border border-line bg-black"
              allow="camera; microphone; display-capture; fullscreen; autoplay; clipboard-write" referrerPolicy="no-referrer" />
          ) : (
            <div className="grid aspect-video w-full place-items-center rounded-card border border-line bg-[#1A2B3D] p-6 text-center text-white">
              {state.status === "SCHEDULED" ? (
                <div className="flex flex-col items-center gap-2"><Icon name="clock" className="text-3xl" /><b>Your teacher hasn&apos;t started the class yet.</b><span className="text-sm opacity-80">This page checks every few seconds. Stay here and the Join button will appear.</span></div>
              ) : live && !T ? (
                <div className="flex flex-col items-center gap-3"><b className="text-lg">{title} is live</b>
                  <button className="btn-primary" disabled={pending} onClick={() => act(async () => {
                    // Open the tab inside the click so pop-up blockers allow it, then record attendance.
                    const tab = external ? window.open(video.url, "_blank", "noopener,noreferrer") : null;
                    const r = await joinLive(id);
                    if (r?.error) { tab?.close(); setNotice(r.error); } else joined.current = true;
                  })}>Join class <Icon name="video" /></button>
                  <span className="text-xs opacity-80">Your attendance is recorded when you join.</span>
                </div>
              ) : <b>The class has ended.</b>}
            </div>
          )}
          {notice && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{notice}</p>}
        </div>

        <aside className="card gap-3 p-3" aria-label="Class panel">
          <div className="flex gap-1" role="group" aria-label="Panel">
            {([["people", `People${hands ? ` (${hands} ✋)` : ""}`], ["chat", "Chat"], ["poll", openPoll ? "Poll •" : "Poll"]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={panel === k} onClick={() => setPanel(k)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-bold ${panel === k ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2"}`}>{l}</button>
            ))}
          </div>
          {panel === "people" && <People state={state} T={T} speak={T && educop && live} onLower={(uid) => act(() => lowerHand(id, uid))}
            onSpeak={(uid, on) => act(async () => { const r = await setSpeaking(id, uid, on); setNotice(r.error ?? r.ok ?? null); })} />}
          {panel === "chat" && <Chat state={state} T={T} canChat={live && (T || state.me.joined)} pending={pending}
            onSend={(body) => new Promise<string | null>((resolve) => start(async () => {
              const r = T ? await teacherChat(id, body) : await studentChat(id, body);
              await refresh();
              resolve(r.error ?? ("held" in r && r.held ? "Held for review: messages with contact details or links wait for your teacher." : null));
            }))}
            onModerate={(cid, d) => act(() => moderateChat(id, cid, d))} />}
          {panel === "poll" && <Polls state={state} T={T} live={live} canVote={state.me.joined} pending={pending}
            onVote={(pid, i) => act(() => votePoll(id, pid, i))}
            onToggle={(pid, open) => act(() => setPollOpen(id, pid, open))}
            onCreate={(q, o) => new Promise<string | null>((resolve) => start(async () => { const r = await createPoll(id, q, o); await refresh(); resolve(r.error ?? null); }))} />}
        </aside>
      </div>
    </div>
  );
}

function Timer({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const txt = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return <span className="chip tnum" aria-label={`Running for ${Math.floor(s / 60)} minutes`}>{txt}</span>;
}

function People({ state, T, speak, onLower, onSpeak }: {
  state: LiveState; T: boolean; speak: boolean; onLower: (id: string) => void; onSpeak: (id: string, on: boolean) => void;
}) {
  const here = state.people.filter((p) => p.present);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <b>{here.length} in class{T ? ` · ${state.people.length - here.length} not here` : ""}</b>
      <ul className="flex max-h-96 flex-col overflow-y-auto">
        {(T ? [...state.people].sort((a, b) => Number(b.hand) - Number(a.hand) || Number(b.present) - Number(a.present)) : here).map((p) => (
          <li key={p.id} className="flex items-center gap-2 border-t border-line py-2 first:border-0">
            <span className={`h-2 w-2 flex-none rounded-full ${p.present ? "bg-good" : "bg-line"}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            {T && <span className="text-xs text-muted">{p.present ? "Here" : p.joined ? "Left" : "Not joined"}</span>}
            {p.hand && <span title="Hand raised" aria-label="Hand raised">✋</span>}
            {p.speaking && <span title="Can speak" aria-label="Can speak"><Icon name="mic" className="text-teal" /></span>}
            {T && p.hand && <button className="btn btn-sm" onClick={() => onLower(p.id)}>Lower</button>}
            {speak && p.joined && (p.speaking
              ? <button className="btn btn-sm" onClick={() => onSpeak(p.id, false)} aria-label={`Stop ${p.name} speaking`}>Stop</button>
              : p.present && <button className="btn btn-sm" onClick={() => onSpeak(p.id, true)} aria-label={`Invite ${p.name} to speak`}>Invite to speak</button>)}
          </li>
        ))}
      </ul>
      {T && <p className="text-xs text-muted">Attendance is recorded automatically when students join. Camera off is never counted as absence.</p>}
      {speak && <p className="text-xs text-muted">Invited students can use their microphone, and their camera if they choose. Stop takes it back straight away.</p>}
    </div>
  );
}

function Chat({ state, T, canChat, pending, onSend, onModerate }: {
  state: LiveState; T: boolean; canChat: boolean; pending: boolean;
  onSend: (body: string) => Promise<string | null>; onModerate: (id: string, d: "approve" | "remove") => void;
}) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [state.chat.length]);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <ul className="flex max-h-80 min-h-[8rem] flex-col gap-2 overflow-y-auto" aria-label="Class chat">
        {state.chat.length === 0 && <li className="text-muted">No messages yet.</li>}
        {state.chat.map((c) => (
          <li key={c.id} className={c.held ? "rounded-lg bg-warn-soft p-2" : ""}>
            <b className={c.host ? "text-teal" : "text-brand"}>{c.mine ? "You" : c.name}</b>
            <div className="[overflow-wrap:anywhere]">{c.body}</div>
            {c.held && <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-warn">Held for review
              {T && <><button className="btn btn-sm" onClick={() => onModerate(c.id, "approve")}>Approve</button><button className="btn btn-sm" onClick={() => onModerate(c.id, "remove")}>Remove</button></>}
            </div>}
          </li>
        ))}
        <li ref={end} aria-hidden="true" />
      </ul>
      {canChat ? (
        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; const r = await onSend(text); setMsg(r); if (!r || r.startsWith("Held")) setText(""); }}>
          <label className="sr-only" htmlFor="live-chat">Message the class</label>
          <input id="live-chat" className="input" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Message the class" autoComplete="off" />
          <button className="btn-primary btn-sm" disabled={pending} aria-label="Send"><Icon name="send" /></button>
        </form>
      ) : <p className="text-xs text-muted">{T ? "Chat opens when the class is live." : "Join the class to chat."}</p>}
      {msg && <p role="status" className="text-xs font-bold text-warn">{msg}</p>}
      <p className="text-xs text-muted">Messages with personal info or links are held for teacher review.</p>
    </div>
  );
}

function Polls({ state, T, live, canVote, pending, onVote, onToggle, onCreate }: {
  state: LiveState; T: boolean; live: boolean; canVote: boolean; pending: boolean;
  onVote: (id: string, i: number) => void; onToggle: (id: string, open: boolean) => void; onCreate: (q: string, o: string[]) => Promise<string | null>;
}) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState("Yes\nNo\nNot sure");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3 text-sm">
      {T && live && (
        <form className="flex flex-col gap-2 rounded-lg border border-line p-2.5" onSubmit={async (e) => { e.preventDefault(); const r = await onCreate(q, opts.split("\n")); setErr(r); if (!r) setQ(""); }}>
          <b>Launch a quick poll</b>
          <div className="flex flex-wrap gap-1">{PRESETS.map((p) => <button key={p.q} type="button" className="btn btn-sm" onClick={() => { setQ(p.q); setOpts(p.o.join("\n")); }}>{p.q}</button>)}</div>
          <label className="label">Question<input className="input" value={q} maxLength={200} onChange={(e) => setQ(e.target.value)} /></label>
          <label className="label">Options <span className="font-normal text-muted">(one per line)</span><textarea className="input" rows={3} value={opts} onChange={(e) => setOpts(e.target.value)} /></label>
          {err && <p role="alert" className="text-xs font-bold text-bad">{err}</p>}
          <button className="btn-primary btn-sm self-start" disabled={pending}><Icon name="poll" /> Start poll</button>
        </form>
      )}
      {state.polls.length === 0 && <p className="text-muted">{T ? "No polls yet." : "No poll running. Your teacher will start one soon."}</p>}
      {state.polls.map((p) => (
        <div key={p.id} className="flex flex-col gap-2 rounded-lg border border-line p-2.5">
          <div className="flex items-start justify-between gap-2"><b>{p.question}</b><span className={`chip ${p.open ? "bg-good-soft text-good" : ""}`}>{p.open ? "Open" : "Closed"}</span></div>
          {p.options.map((o, i) => (
            <div key={i} className="flex flex-col gap-1">
              {p.counts ? (
                <>
                  <div className="flex justify-between"><span>{p.myVote === i ? "✓ " : ""}{o}</span><span className="tnum">{p.counts[i]}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true"><div className="h-full rounded-full bg-brand" style={{ width: `${p.total ? (p.counts[i] / p.total) * 100 : 0}%` }} /></div>
                </>
              ) : (
                <button className={p.myVote === i ? "btn-primary btn-sm justify-start" : "btn btn-sm justify-start"} aria-pressed={p.myVote === i} disabled={pending || !p.open || !canVote}
                  onClick={() => onVote(p.id, i)}>{p.myVote === i ? "✓ " : ""}{o}</button>
              )}
            </div>
          ))}
          {p.total != null && <p className="text-xs text-muted">{p.total} {p.total === 1 ? "response" : "responses"}</p>}
          {T && live && <button className="btn btn-sm self-start" disabled={pending} onClick={() => onToggle(p.id, !p.open)}>{p.open ? "End poll" : "Reopen"}</button>}
        </div>
      ))}
    </div>
  );
}
