"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Participant, Room, Track, TrackPublication } from "livekit-client";
import { upload } from "@vercel/blob/client";
import { Icon } from "@/components/icons";
import { muteAll } from "@/app/teacher/live/actions";
import { recordingFileName, recordingSource, roleFromMetadata } from "@/lib/livekit-utils";

// Educop live (beta): the class video on LiveKit, with our own controls styled
// like the recorded-class player. The teacher publishes camera, mic and screen
// share and can record the main stage in their browser; students watch and
// listen, and use mic and camera only while the teacher invites them.

type LK = typeof import("livekit-client");
type Phase = "connecting" | "connected" | "reconnecting" | "failed" | "disconnected" | "ended" | "unavailable";
type RecState =
  | { s: "idle" }
  | { s: "recording"; since: number }
  | { s: "uploading"; pct: number }
  | { s: "uploaded"; formUrl: string }
  | { s: "download"; href: string; fileName: string; why: string };

const CONNECT_TIMEOUT_MS = 20_000;
const MAX_UPLOAD = 2 * 1024 * 1024 * 1024;
const LOW_BW_KEY = "educop-live-low-bandwidth";
const QUALITY: Record<string, { bars: number; label: string }> = {
  excellent: { bars: 3, label: "Excellent" }, good: { bars: 2, label: "Good" }, poor: { bars: 1, label: "Poor" }, lost: { bars: 0, label: "Lost" },
};

export function EducopStage({ id, role, title, names, uploadEnabled = false, onBusy }: {
  id: string; role: "TEACHER" | "STUDENT"; title: string;
  /** Teacher only: full names by user id (the video service only carries short names). */
  names?: Record<string, string>;
  /** Teacher only: Vercel Blob is connected, so recordings upload straight away. */
  uploadEnabled?: boolean;
  /** Teacher only: true while a recording is running or uploading. */
  onBusy?: (busy: boolean) => void;
}) {
  const T = role === "TEACHER";
  const wrap = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const lkRef = useRef<LK | null>(null);
  const [, setTick] = useState(0);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [canPlayAudio, setCanPlayAudio] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyDevice, setBusyDevice] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [lowBw, setLowBw] = useState(false);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  // ---------- Connect ----------
  useEffect(() => {
    let cancelled = false;
    let room: Room | null = null;
    const fail = (msg?: string) => { if (!cancelled) { setError(msg ?? null); setPhase("failed"); } };
    setPhase("connecting");
    setError(null);
    (async () => {
      const res = await fetch(`/api/live/${id}/token`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { url?: string; token?: string; error?: string } | null;
      if (cancelled) return;
      if (res.status === 501) { setError(body?.error ?? null); setPhase("unavailable"); return; }
      if (!res.ok || !body?.url || !body.token) return fail(body?.error);
      const lk = await import("livekit-client");
      if (cancelled) return;
      lkRef.current = lk;
      const { RoomEvent } = lk;
      room = new lk.Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      const r = room;
      r.on(RoomEvent.Reconnecting, () => setPhase("reconnecting"))
        .on(RoomEvent.SignalReconnecting, () => setPhase("reconnecting"))
        .on(RoomEvent.Reconnected, () => setPhase("connected"))
        .on(RoomEvent.Disconnected, (reason) => {
          if (cancelled) return;
          if (reason === lk.DisconnectReason.ROOM_DELETED) setPhase("ended");
          else if (reason === lk.DisconnectReason.DUPLICATE_IDENTITY) { setError("You opened this class in another tab or device, so the video moved there."); setPhase("disconnected"); }
          else if (reason !== lk.DisconnectReason.CLIENT_INITIATED) setPhase("disconnected");
        })
        .on(RoomEvent.AudioPlaybackStatusChanged, () => setCanPlayAudio(r.canPlaybackAudio))
        .on(RoomEvent.MediaDevicesError, () => setNotice("Your camera or microphone couldn't start. Check the browser's permission for this site."));
      for (const e of [
        RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackPublished, RoomEvent.TrackUnpublished,
        RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted,
        RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.ActiveSpeakersChanged,
        RoomEvent.ConnectionQualityChanged, RoomEvent.ParticipantPermissionsChanged, RoomEvent.ParticipantMetadataChanged,
      ] as const) r.on(e, bump);
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        r.connect(body.url, body.token),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), CONNECT_TIMEOUT_MS); }),
      ]).finally(() => clearTimeout(timer));
      if (cancelled) return;
      setCanPlayAudio(r.canPlaybackAudio);
      setPhase("connected");
      bump();
    })().catch(() => fail());
    return () => {
      cancelled = true;
      void room?.disconnect();
      roomRef.current = null;
    };
  }, [id, attempt, bump]);

  // ---------- Full screen and preferences ----------
  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === wrap.current);
    document.addEventListener("fullscreenchange", onFs);
    try { if (!T) setLowBw(localStorage.getItem(LOW_BW_KEY) === "1"); } catch { /* storage blocked: default off */ }
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [T]);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrap.current?.requestFullscreen?.().catch(() => undefined);
  };

  // ---------- What's on stage ----------
  const lk = lkRef.current;
  const room = phase === "connected" || phase === "reconnecting" ? roomRef.current : null;
  const remotes = room ? [...room.remoteParticipants.values()] : [];
  const me = room?.localParticipant ?? null;
  const teacherP: Participant | null = T ? me : remotes.find((p) => roleFromMetadata(p.metadata) === "teacher") ?? null;
  const pub = (p: Participant | null, src: Track.Source | undefined) => (p && src ? p.getTrackPublication(src) : undefined);
  const live = (x: TrackPublication | undefined) => (x?.track && !x.isMuted ? x.track : null);
  const screenTrack = live(pub(teacherP, lk?.Track.Source.ScreenShare));
  const camTrack = live(pub(teacherP, lk?.Track.Source.Camera));
  const main = screenTrack ?? camTrack;
  const students = [...(T ? [] : me && roleFromMetadata(me.metadata) !== "teacher" ? [me] : []), ...remotes]
    .filter((p) => roleFromMetadata(p.metadata) === "student" && (pub(p, lk?.Track.Source.Camera) || pub(p, lk?.Track.Source.Microphone)));
  const tiles = [...(screenTrack && camTrack && teacherP ? [teacherP] : []), ...students];
  const audio = remotes.flatMap((p) => [...p.audioTrackPublications.values()].map((x) => x.track).filter((t): t is NonNullable<typeof t> => !!t));
  const canPublish = T || !!me?.permissions?.canPublish;
  const micOn = !!me?.isMicrophoneEnabled;
  const camOn = !!me?.isCameraEnabled;
  const sharing = !!me?.isScreenShareEnabled;
  const quality = QUALITY[me?.connectionQuality ?? ""];
  const displayName = (p: Participant) => (p === me ? "You" : names?.[p.identity] ?? p.name ?? "Student");

  // Students' low-bandwidth mode: no cameras, only the screen share and audio.
  useEffect(() => {
    if (!room || !lk || T) return;
    for (const p of room.remoteParticipants.values()) {
      for (const x of p.videoTrackPublications.values()) {
        const want = !lowBw || x.source === lk.Track.Source.ScreenShare;
        if (x.isDesired !== want) x.setSubscribed(want);
      }
    }
  });

  async function device(kind: "mic" | "camera" | "screen") {
    if (!me || busyDevice) return;
    setBusyDevice(true);
    setNotice(null);
    try {
      if (kind === "mic") await me.setMicrophoneEnabled(!micOn);
      else if (kind === "camera") await me.setCameraEnabled(!camOn);
      else await me.setScreenShareEnabled(!sharing, { audio: true });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (kind === "screen" && name === "NotAllowedError") { /* the teacher cancelled the picker */ }
      else setNotice(kind === "screen" ? "Screen sharing couldn't start." : `Your ${kind === "mic" ? "microphone" : "camera"} couldn't start. Check the browser's permission for this site.`);
    } finally { setBusyDevice(false); bump(); }
  }

  // ---------- Recording (teacher, in the browser, free) ----------
  const recorder = useRecorder({
    id, title, uploadEnabled, onBusy, setNotice,
    video: T ? recordingSource({ screen: screenTrack?.mediaStreamTrack, camera: camTrack?.mediaStreamTrack }) : null,
    mic: T && micOn ? pub(me, lk?.Track.Source.Microphone)?.track?.mediaStreamTrack ?? null : null,
  });

  const btn = "grid h-9 w-9 flex-none place-items-center rounded-lg hover:bg-surface-2 disabled:opacity-50 aria-pressed:bg-brand-soft aria-pressed:text-brand";
  const overlay = "absolute inset-0 grid place-items-center p-6 text-center text-white";

  return (
    <div ref={wrap} role="region" aria-label="Live video" className={`flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-black ${fullscreen ? "h-full justify-center rounded-none border-0" : ""}`}>
      <div className={`relative bg-[#1A2B3D] ${fullscreen ? "min-h-0 flex-1" : "aspect-video"}`}>
        {main && <VideoView track={main} label={screenTrack ? "Screen share" : T ? "Your camera" : "Teacher's camera"} mirror={T && !screenTrack} fit={screenTrack ? "contain" : "cover"} />}
        {audio.map((t) => <AudioView key={t.sid ?? t.mediaStreamTrack.id} track={t} />)}

        {phase === "connecting" && <div className={overlay}><div className="flex flex-col items-center gap-2"><span className="h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" aria-hidden="true" /><b role="status">Connecting to the live video…</b></div></div>}
        {phase === "failed" && (
          <div className={overlay} role="alert">
            <div className="flex max-w-md flex-col items-center gap-3">
              <b className="text-lg">Couldn&apos;t connect to the live video service</b>
              <span className="text-sm opacity-80">{error ?? "Check your internet connection and try again. Chat, hands and polls on this page still work."}</span>
              <button type="button" className="btn-primary" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
            </div>
          </div>
        )}
        {phase === "unavailable" && <div className={overlay} role="alert"><div className="flex max-w-md flex-col items-center gap-2"><b className="text-lg">Live video isn&apos;t set up yet</b><span className="text-sm opacity-80">{error ?? "Educop live needs a LiveKit account."} Chat, hands and polls still work.</span></div></div>}
        {phase === "disconnected" && (
          <div className={overlay} role="alert"><div className="flex max-w-md flex-col items-center gap-3"><b className="text-lg">You&apos;re disconnected from the video</b>
            <span className="text-sm opacity-80">{error ?? "The connection dropped."}</span>
            <button type="button" className="btn-primary" onClick={() => setAttempt((a) => a + 1)}>Reconnect</button></div></div>
        )}
        {phase === "ended" && <div className={overlay}><b className="text-lg">The class has ended.</b></div>}
        {phase === "reconnecting" && <p role="status" className="absolute inset-x-3 top-3 rounded-lg bg-warn-soft px-3 py-2 text-sm font-bold text-warn">Reconnecting… the video will come back by itself.</p>}

        {room && !main && (
          <div className={overlay}>
            <div className="flex max-w-md flex-col items-center gap-2">
              <Icon name="video" className="text-3xl" />
              {T ? <><b>Your camera is off</b><span className="text-sm opacity-80">Turn on your camera and microphone, or share your screen, with the buttons below.</span></>
                : lowBw && teacherP && pub(teacherP, lk?.Track.Source.Camera) ? <><b>Low-bandwidth mode</b><span className="text-sm opacity-80">Video is off to save data. You can still hear your teacher and see shared screens.</span></>
                : <><b>{teacherP ? "Your teacher's camera is off" : "Waiting for your teacher's video…"}</b><span className="text-sm opacity-80">You can still hear your teacher when they talk.</span></>}
            </div>
          </div>
        )}

        {room && !canPlayAudio && (
          <div className="absolute inset-0 grid place-items-center bg-black/60">
            <button type="button" className="btn-primary" onClick={() => void room.startAudio().then(() => setCanPlayAudio(room.canPlaybackAudio)).catch(() => undefined)}>
              <Icon name="volume" /> Click to enable sound
            </button>
          </div>
        )}

        {recorder.state.s === "recording" && (
          <span className="chip tnum absolute left-3 top-3 bg-bad-soft text-bad"><span className="h-2 w-2 animate-pulse rounded-full bg-bad" aria-hidden="true" /> Recording <RecTimer since={recorder.state.since} /></span>
        )}

        {tiles.length > 0 && (
          <ul aria-label="Students on stage" className="absolute inset-x-2 bottom-2 flex gap-2 overflow-x-auto">
            {tiles.map((p) => {
              const cam = !lowBw || p === me || p === teacherP ? live(pub(p, lk?.Track.Source.Camera)) : null;
              const mic = !!p.isMicrophoneEnabled;
              return (
                <li key={p.identity} className={`relative aspect-video w-32 flex-none overflow-hidden rounded-lg border-2 bg-[#0F1C2A] sm:w-40 ${p.isSpeaking ? "border-teal" : "border-transparent"}`}>
                  {cam ? <VideoView track={cam} label={displayName(p)} mirror={p === me} fit="cover" />
                    : <span className="grid h-full place-items-center text-2xl font-bold text-white" aria-hidden="true">{displayName(p).slice(0, 1)}</span>}
                  <span className="absolute inset-x-1 bottom-1 flex items-center gap-1 truncate rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
                    <Icon name={mic ? "mic" : "micOff"} /><span className="truncate">{displayName(p)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1 bg-surface px-3 py-2">
        <div className="flex flex-wrap items-center gap-1 text-fg">
          {canPublish && (
            <>
              <button type="button" className={btn} disabled={!room || busyDevice} onClick={() => device("mic")} aria-label={micOn ? "Turn microphone off" : "Turn microphone on"} aria-pressed={micOn}><Icon name={micOn ? "mic" : "micOff"} /></button>
              <button type="button" className={btn} disabled={!room || busyDevice} onClick={() => device("camera")} aria-label={camOn ? "Turn camera off" : "Turn camera on"} aria-pressed={camOn}><Icon name={camOn ? "video" : "videoOff"} /></button>
            </>
          )}
          {T && <button type="button" className={btn} disabled={!room || busyDevice} onClick={() => device("screen")} aria-label={sharing ? "Stop sharing your screen" : "Share your screen"} aria-pressed={sharing}><Icon name="screen" /></button>}
          {T && (recorder.state.s === "recording"
            ? <button type="button" className="btn btn-sm border-bad text-bad" onClick={recorder.stop}><Icon name="record" /> Stop recording</button>
            : <button type="button" className="btn btn-sm" disabled={!room || recorder.state.s === "uploading"} onClick={recorder.start}><Icon name="record" className="text-bad" /> Record</button>)}
          {T && <button type="button" className="btn btn-sm" disabled={!room} onClick={async () => { const r = await muteAll(id); setNotice(r.error ?? r.ok ?? null); }}><Icon name="micOff" /> Mute all</button>}
          {!T && !canPlayAudio && room && <button type="button" className={btn} onClick={() => void room.startAudio().then(() => setCanPlayAudio(room.canPlaybackAudio))} aria-label="Enable sound"><Icon name="mute" /></button>}
          <span className="flex-1" />
          {!T && (
            <button type="button" className="btn btn-sm" aria-pressed={lowBw} onClick={() => { const v = !lowBw; setLowBw(v); try { localStorage.setItem(LOW_BW_KEY, v ? "1" : "0"); } catch { /* not saved */ } }}>
              Low-bandwidth mode{lowBw ? ": on" : ""}
            </button>
          )}
          <span className="flex items-center gap-1 px-1 text-xs text-muted" title="Connection quality">
            <Bars n={quality?.bars ?? -1} /><span className="sr-only sm:not-sr-only">{room ? quality?.label ?? "Checking" : phase === "reconnecting" ? "Reconnecting" : "Offline"}</span>
          </span>
          <button type="button" className={btn} onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"}><Icon name={fullscreen ? "shrink" : "expand"} /></button>
        </div>
        {!T && canPublish && <p role="status" className="text-xs font-bold text-teal">Your teacher invited you to speak. Turn on your microphone; your camera is optional.</p>}
        <RecordingStatus state={recorder.state} liveId={id} />
        {notice && <p role="status" className="text-xs font-bold text-warn">{notice}</p>}
      </div>
    </div>
  );
}

function VideoView({ track, label, mirror, fit }: { track: Track; label: string; mirror?: boolean; fit: "cover" | "contain" }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => { track.detach(el); };
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted aria-label={label} className={`absolute inset-0 h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"} ${mirror ? "-scale-x-100" : ""}`} />;
}

function AudioView({ track }: { track: Track }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => { track.detach(el); };
  }, [track]);
  return <audio ref={ref} autoPlay />;
}

function Bars({ n }: { n: number }) {
  return (
    <span className="flex h-3.5 items-end gap-0.5" aria-hidden="true">
      {[1, 2, 3].map((i) => <span key={i} className={`w-1 rounded-sm ${n >= i ? (n === 1 ? "bg-bad" : n === 2 ? "bg-warn" : "bg-good") : "bg-line"}`} style={{ height: `${i * 33}%` }} />)}
    </span>
  );
}

function RecTimer({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return <span>{`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`}</span>;
}

function RecordingStatus({ state, liveId }: { state: RecState; liveId: string }) {
  if (state.s === "uploading") return (
    <div className="flex items-center gap-2 text-xs">
      <span>Uploading the recording</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Upload progress" aria-valuenow={state.pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-teal" style={{ width: `${state.pct}%` }} />
      </div>
      <span className="tnum w-10 text-right">{state.pct}%</span>
    </div>
  );
  if (state.s === "uploaded") return (
    <p role="status" className="flex flex-wrap items-center gap-2 text-xs"><b className="text-good">Recording uploaded.</b>
      <a className="btn btn-sm" href={state.formUrl} target="_blank" rel="noopener">Open the recording draft</a>
      <span className="text-muted">Add captions, chapters and questions, then publish it to the class.</span></p>
  );
  if (state.s === "download") return (
    <p role="status" className="flex flex-wrap items-center gap-2 text-xs"><span>{state.why}</span>
      <a className="btn btn-sm" href={state.href} download={state.fileName}><Icon name="download" /> Download recording</a>
      <Link className="font-bold text-brand underline" href={`/teacher/recordings/new?live=${liveId}`} target="_blank">Add it as a recorded class later</Link></p>
  );
  return null;
}

// ---------- Browser recording ----------

type Relay = { track: MediaStreamTrack; use: (t: MediaStreamTrack) => void; stop: () => void };
type Ctor<T> = new (init: Record<string, unknown>) => T;

/**
 * Feeds whichever track is on the main stage into one steady video track, so a
 * recording keeps going when the teacher starts or stops sharing their screen.
 * Uses insertable streams (Chrome and Edge); other browsers record the source
 * the recording started with.
 */
function makeRelay(first: MediaStreamTrack): Relay | null {
  const w = window as unknown as {
    MediaStreamTrackGenerator?: Ctor<MediaStreamTrack & { writable: WritableStream<VideoFrame> }>;
    MediaStreamTrackProcessor?: Ctor<{ readable: ReadableStream<VideoFrame> }>;
  };
  const Gen = w.MediaStreamTrackGenerator, Proc = w.MediaStreamTrackProcessor;
  if (!Gen || !Proc) return null;
  const gen = new Gen({ kind: "video" });
  const writer = gen.writable.getWriter();
  let current: MediaStreamTrack | null = null;
  let reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
  const use = (t: MediaStreamTrack) => {
    if (t === current) return;
    current = t;
    void reader?.cancel().catch(() => undefined);
    const r = new Proc({ track: t }).readable.getReader();
    reader = r;
    void (async () => {
      for (;;) {
        const { value, done } = await r.read().catch(() => ({ value: undefined, done: true as const }));
        if (done || !value) break;
        if (reader !== r) { value.close(); break; }
        await writer.write(value).catch(() => value.close());
      }
    })();
  };
  use(first);
  return { track: gen, use, stop: () => { void reader?.cancel().catch(() => undefined); void writer.close().catch(() => undefined); gen.stop(); } };
}

function useRecorder({ id, title, uploadEnabled, onBusy, setNotice, video, mic }: {
  id: string; title: string; uploadEnabled: boolean; onBusy?: (busy: boolean) => void; setNotice: (s: string | null) => void;
  video: { kind: "screen" | "camera"; track: MediaStreamTrack } | null; mic: MediaStreamTrack | null;
}) {
  const [state, setState] = useState<RecState>({ s: "idle" });
  const rec = useRef<{ recorder: MediaRecorder; chunks: Blob[]; since: number; ctx: AudioContext; dest: MediaStreamAudioDestinationNode; micNode: MediaStreamAudioSourceNode | null; micTrack: MediaStreamTrack | null; relay: Relay | null; fixed: MediaStreamTrack } | null>(null);
  const busy = state.s === "recording" || state.s === "uploading";

  useEffect(() => { onBusy?.(busy); }, [busy, onBusy]);
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  // Follow the main stage and the teacher's microphone while recording.
  const videoTrack = video?.track ?? null;
  useEffect(() => {
    const r = rec.current;
    if (!r || state.s !== "recording" || !videoTrack) return;
    if (r.relay) r.relay.use(videoTrack);
    else if (videoTrack !== r.fixed) setNotice("This browser keeps recording the view you started with. To record the new view, stop and start a new recording.");
  }, [videoTrack, state.s, setNotice]);
  useEffect(() => {
    const r = rec.current;
    if (!r || state.s !== "recording" || r.micTrack === mic) return;
    r.micNode?.disconnect();
    r.micNode = mic ? r.ctx.createMediaStreamSource(new MediaStream([mic])) : null;
    r.micNode?.connect(r.dest);
    r.micTrack = mic;
  }, [mic, state.s]);

  // Stop cleanly if the stage goes away mid-recording.
  useEffect(() => () => {
    const r = rec.current;
    if (!r) return;
    if (r.recorder.state !== "inactive") r.recorder.stop();
    r.relay?.stop();
    void r.ctx.close().catch(() => undefined);
  }, []);

  const start = () => {
    setNotice(null);
    if (typeof MediaRecorder === "undefined") return setNotice("This browser can't record. Try Chrome, Edge or Firefox.");
    if (!video) return setNotice("Turn on your camera or share your screen, then press Record.");
    const mime = ["video/webm;codecs=vp8,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    if (!mime) return setNotice("This browser can't record WebM video. Try Chrome, Edge or Firefox.");
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const relay = makeRelay(video.track);
    const recorder = new MediaRecorder(new MediaStream([relay?.track ?? video.track, ...dest.stream.getAudioTracks()]), { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    const since = Date.now();
    const r = { recorder, chunks: [] as Blob[], since, ctx, dest, micNode: null, micTrack: null, relay, fixed: video.track };
    rec.current = r;
    recorder.ondataavailable = (e) => { if (e.data.size) r.chunks.push(e.data); };
    recorder.start(1000);
    setState({ s: "recording", since });
  };

  const stop = () => {
    const r = rec.current;
    if (!r || r.recorder.state === "inactive") return;
    // Open the draft's tab inside the click so pop-up blockers allow it; it's filled in after the upload.
    const tab = uploadEnabled ? window.open("", "_blank") : null;
    if (tab) { tab.document.title = "Uploading recording…"; tab.document.body.textContent = "Uploading your class recording… Keep the class tab open. This page opens the recording form when the upload finishes."; }
    r.recorder.onstop = async () => {
      r.relay?.stop();
      void r.ctx.close().catch(() => undefined);
      rec.current = null;
      const durationSec = Math.max(1, Math.round((Date.now() - r.since) / 1000));
      const blob = new Blob(r.chunks, { type: "video/webm" });
      const fileName = recordingFileName(title, new Date(r.since));
      const offerDownload = (why: string) => { tab?.close(); setState({ s: "download", href: URL.createObjectURL(blob), fileName, why }); };
      if (!uploadEnabled) return offerDownload("Recording ready. Video storage isn't connected, so download it and upload it as a recorded class later.");
      if (blob.size > MAX_UPLOAD) return offerDownload("The recording is over 2 GB, too big to upload. Download it instead.");
      setState({ s: "uploading", pct: 0 });
      try {
        const up = await upload(`recordings/${fileName}`, blob, {
          access: "public", handleUploadUrl: "/api/recordings/upload", contentType: "video/webm", multipart: blob.size > 100 * 1024 * 1024,
          onUploadProgress: (e) => setState({ s: "uploading", pct: Math.round(e.percentage) }),
        });
        const formUrl = `/teacher/recordings/new?live=${encodeURIComponent(id)}&video=${encodeURIComponent(up.url)}&duration=${durationSec}`;
        if (tab && !tab.closed) tab.location.href = new URL(formUrl, window.location.href).href;
        setState({ s: "uploaded", formUrl });
      } catch {
        offerDownload("The upload didn't work. Download the recording so it isn't lost, then upload it as a recorded class.");
      }
    };
    r.recorder.stop();
  };

  return { state, start, stop };
}
