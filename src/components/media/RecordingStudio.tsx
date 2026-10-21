"use client";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Icon } from "@/components/icons";
import { fmtClock, type Chapter } from "@/lib/recordings";
import { addChapter, encodeChapters, sceneTitle, studioFileName } from "@/lib/studio";

// The recording studio: a teacher records a class in the browser from their
// camera, a shared screen or a whiteboard, and can switch between them and
// write over any of them while recording. Everything is drawn onto one
// 1280×720 canvas, and that canvas plus the mixed microphone and screen audio
// is what gets recorded. Switching views marks a chapter automatically.

type Scene = "camera" | "screen" | "board";
type Tool = "pen" | "highlighter" | "eraser";
type BoardBg = "white" | "grid" | "chalk";
type Stroke = { tool: Tool; color: string; size: number; pts: number[] };
type Layer = { canvas: HTMLCanvasElement; strokes: Stroke[]; history: Stroke[][] };
type Board = { bg: BoardBg; layer: Layer };
type Corner = "br" | "bl" | "tr" | "tl";
type Phase =
  | { s: "setup" }
  | { s: "countdown"; n: number }
  | { s: "recording"; paused: boolean }
  | { s: "review"; url: string; blob: Blob; durationSec: number }
  | { s: "uploading"; pct: number }
  | { s: "done" };

const W = 1280;
const H = 720;
const FPS = 30;
const MAX_UPLOAD = 2 * 1024 * 1024 * 1024;
const COLORS = [
  { v: "#111827", name: "Black" }, { v: "#ffffff", name: "White" }, { v: "#2563eb", name: "Blue" },
  { v: "#dc2626", name: "Red" }, { v: "#16a34a", name: "Green" }, { v: "#f59e0b", name: "Yellow" },
];
const SIZES = [{ v: 3, name: "Thin" }, { v: 6, name: "Medium" }, { v: 12, name: "Thick" }];
const BG: Record<BoardBg, string> = { white: "Plain", grid: "Grid", chalk: "Chalkboard" };

function newLayer(): Layer {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  return { canvas, strokes: [], history: [] };
}

function strokePath(ctx: CanvasRenderingContext2D, s: Stroke) {
  const p = s.pts;
  if (p.length < 2) return;
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.lineWidth = s.tool === "highlighter" ? s.size * 4 : s.tool === "eraser" ? s.size * 5 : s.size;
  ctx.strokeStyle = s.tool === "eraser" ? "#000" : s.color;
  if (s.tool === "eraser") ctx.globalCompositeOperation = "destination-out";
  if (s.tool === "highlighter") ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  if (p.length === 2) ctx.lineTo(p[0] + 0.01, p[1]);
  // Smooth the line through the midpoints between samples.
  for (let i = 2; i < p.length - 2; i += 2) ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
  if (p.length > 2) ctx.lineTo(p[p.length - 2], p[p.length - 1]);
  ctx.stroke();
  ctx.restore();
}

function redraw(layer: Layer) {
  const ctx = layer.canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  for (const s of layer.strokes) strokePath(ctx, s);
}

function boardBackground(bg: BoardBg) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg === "chalk" ? "#1f3b2d" : "#ffffff";
  ctx.fillRect(0, 0, W, H);
  if (bg === "grid") {
    ctx.strokeStyle = "#dbe4f0"; ctx.lineWidth = 1;
    for (let x = 40; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
    for (let y = 40; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
  }
  return c;
}

/** Draws a video into a box, either filling it (cropped) or fitting inside it. */
function drawVideo(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, x: number, y: number, w: number, h: number, cover: boolean) {
  const vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !vh) return false;
  const scale = cover ? Math.max(w / vw, h / vh) : Math.min(w / vw, h / vh);
  const dw = vw * scale, dh = vh * scale;
  ctx.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  return true;
}

/**
 * A steady clock from a worker. Browsers slow down timers in a tab that's in
 * the background (say while the teacher is in the app they're sharing), which
 * would freeze the recording; a worker's timer keeps running.
 */
function startTicker(fn: () => void) {
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${Math.round(1000 / FPS)});`], { type: "text/javascript" }));
    const w = new Worker(url);
    w.onmessage = fn;
    return () => { w.terminate(); URL.revokeObjectURL(url); };
  } catch {
    const t = setInterval(fn, 1000 / FPS);
    return () => clearInterval(t);
  }
}

export function RecordingStudio({ uploadEnabled }: { uploadEnabled: boolean }) {
  const router = useRouter();
  const outRef = useRef<HTMLCanvasElement>(null);
  const camVideo = useRef<HTMLVideoElement>(null);
  const screenVideo = useRef<HTMLVideoElement>(null);

  const [scene, setScene] = useState<Scene>("board");
  const [boards, setBoards] = useState<Board[]>([]);
  const [page, setPage] = useState(0);
  const [cam, setCam] = useState<MediaStream | null>(null);
  const [mic, setMic] = useState<MediaStream | null>(null);
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const [bubble, setBubble] = useState<Corner | null>("br");
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0].v);
  const [size, setSize] = useState(SIZES[1].v);
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<Phase>({ s: "setup" });
  const [elapsed, setElapsed] = useState(0);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [, bump] = useState(0);
  // Known only in the browser; assume yes until then so the first render matches the server's.
  const [canShare, setCanShare] = useState(true);
  useEffect(() => { setCanShare(!!navigator.mediaDevices?.getDisplayMedia); }, []);

  // Everything the drawing clock reads lives here, so it never waits on React.
  const live = useRef({
    scene: "board" as Scene, page: 0, bubble: "br" as Corner | null,
    boards: [] as Board[], camLayer: null as Layer | null, screenLayer: null as Layer | null,
    bgs: {} as Partial<Record<BoardBg, HTMLCanvasElement>>,
    current: null as Stroke | null, liveCanvas: null as HTMLCanvasElement | null,
  });
  const audio = useRef<{ ctx: AudioContext; dest: MediaStreamAudioDestinationNode; analyser: AnalyserNode; mic: MediaStreamAudioSourceNode | null; screen: MediaStreamAudioSourceNode | null } | null>(null);
  const rec = useRef<{ recorder: MediaRecorder; chunks: Blob[]; acc: number; since: number | null } | null>(null);
  const streams = useRef<MediaStream[]>([]);

  const layerFor = useCallback((): Layer | null => {
    const L = live.current;
    if (L.scene === "board") return L.boards[L.page]?.layer ?? null;
    return L.scene === "camera" ? L.camLayer : L.screenLayer;
  }, []);

  // ---------- Set-up and the drawing clock ----------
  useEffect(() => {
    const L = live.current;
    L.camLayer = newLayer(); L.screenLayer = newLayer();
    L.liveCanvas = document.createElement("canvas"); L.liveCanvas.width = W; L.liveCanvas.height = H;
    L.boards = [{ bg: "white", layer: newLayer() }];
    setBoards(L.boards);
    const out = outRef.current!;
    const ctx = out.getContext("2d")!;
    const bgFor = (bg: BoardBg) => (L.bgs[bg] ??= boardBackground(bg));

    const draw = () => {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, W, H);
      const cv = camVideo.current, sv = screenVideo.current;
      const camOn = !!cv?.srcObject && cv.videoWidth > 0;
      let ink: Layer | null = null;
      if (L.scene === "board") {
        const b = L.boards[L.page];
        if (b) { ctx.drawImage(bgFor(b.bg), 0, 0); ink = b.layer; }
      } else {
        const v = L.scene === "camera" ? cv : sv;
        const shown = !!v?.srcObject && drawVideo(ctx, v!, 0, 0, W, H, L.scene === "camera");
        if (!shown) {
          ctx.fillStyle = "#94a3b8"; ctx.font = "600 28px system-ui, sans-serif"; ctx.textAlign = "center";
          ctx.fillText(L.scene === "camera" ? "Camera is off" : "Screen sharing is off", W / 2, H / 2);
        }
        ink = L.scene === "camera" ? L.camLayer : L.screenLayer;
      }
      if (ink) ctx.drawImage(ink.canvas, 0, 0);
      if (L.current && L.current.tool !== "eraser" && L.liveCanvas) ctx.drawImage(L.liveCanvas, 0, 0);
      // The teacher's face in a round bubble over the screen or whiteboard.
      if (L.bubble && L.scene !== "camera" && camOn) {
        const r = 105, m = 24;
        const x = L.bubble.endsWith("l") ? m + r : W - m - r;
        const y = L.bubble.startsWith("t") ? m + r : H - m - r;
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
        ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 12; ctx.fillStyle = "#0f172a"; ctx.fill();
        ctx.shadowBlur = 0; ctx.clip();
        drawVideo(ctx, cv!, x - r, y - r, r * 2, r * 2, true);
        ctx.restore();
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = 4; ctx.strokeStyle = "#ffffff"; ctx.stroke();
      }
    };
    draw();
    const stopTicker = startTicker(draw);

    const own = streams.current;
    return () => {
      stopTicker();
      const r = rec.current;
      if (r && r.recorder.state !== "inactive") { r.recorder.ondataavailable = null; r.recorder.onstop = null; r.recorder.stop(); }
      own.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      void audio.current?.ctx.close().catch(() => undefined);
    };
  }, []);

  // Mirror view settings for the clock.
  useEffect(() => { live.current.bubble = bubble; }, [bubble]);

  // ---------- Recording time and chapters ----------
  const elapsedNow = () => {
    const r = rec.current;
    if (!r) return 0;
    return (r.acc + (r.since != null ? Date.now() - r.since : 0)) / 1000;
  };
  const recording = phase.s === "recording";
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(elapsedNow()), 250);
    return () => clearInterval(t);
  }, [recording]);

  const mark = useCallback((title: string) => {
    if (!rec.current) return;
    const t = elapsedNow();
    setChapters((c) => addChapter(c, t, title));
  }, []);

  // ---------- Views ----------
  const show = useCallback((next: Scene, nextPage = live.current.page) => {
    const L = live.current;
    finishStroke();
    const changed = L.scene !== next || (next === "board" && L.page !== nextPage);
    L.scene = next; L.page = nextPage;
    setScene(next); setPage(nextPage);
    if (changed && rec.current) mark(sceneTitle(next, nextPage));
  }, [mark]);

  // ---------- Devices ----------
  const ensureAudio = () => {
    if (audio.current) return audio.current;
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    audio.current = { ctx, dest, analyser, mic: null, screen: null };
    return audio.current;
  };

  const track = (s: MediaStream) => { streams.current.push(s); return s; };

  const toggleCamera = async (thenShow = false) => {
    setNotice(null);
    if (cam) {
      cam.getTracks().forEach((t) => t.stop());
      setCam(null);
      if (camVideo.current) camVideo.current.srcObject = null;
      if (live.current.scene === "camera") show("board");
      return;
    }
    try {
      const s = track(await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } }));
      setCam(s);
      if (camVideo.current) { camVideo.current.srcObject = s; void camVideo.current.play().catch(() => undefined); }
      if (thenShow) show("camera");
    } catch {
      setNotice("Couldn't turn on your camera. Allow camera access for this site in your browser, then try again.");
    }
  };

  const toggleMic = async () => {
    setNotice(null);
    const a = ensureAudio();
    void a.ctx.resume();
    if (mic) {
      mic.getTracks().forEach((t) => t.stop());
      a.mic?.disconnect(); a.mic = null;
      setMic(null);
      return;
    }
    try {
      const s = track(await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }));
      a.mic = a.ctx.createMediaStreamSource(s);
      a.mic.connect(a.dest); a.mic.connect(a.analyser);
      setMic(s);
    } catch (e) {
      console.warn("Microphone", e);
      setNotice("Couldn't turn on your microphone. Allow microphone access for this site in your browser, then try again.");
    }
  };

  const stopScreen = useCallback(() => {
    setScreen((cur) => { cur?.getTracks().forEach((t) => t.stop()); return null; });
    if (screenVideo.current) screenVideo.current.srcObject = null;
    audio.current?.screen?.disconnect();
    if (audio.current) audio.current.screen = null;
    if (live.current.scene === "screen") show("board");
  }, [show]);

  const shareScreen = async () => {
    setNotice(null);
    if (screen) { show("screen"); return; }
    const a = ensureAudio();
    void a.ctx.resume();
    try {
      const s = track(await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: true }));
      s.getVideoTracks()[0]?.addEventListener("ended", () => { stopScreen(); setNotice("Screen sharing stopped. You're on the whiteboard now."); });
      if (s.getAudioTracks().length) { a.screen = a.ctx.createMediaStreamSource(s); a.screen.connect(a.dest); }
      setScreen(s);
      if (screenVideo.current) { screenVideo.current.srcObject = s; void screenVideo.current.play().catch(() => undefined); }
      show("screen");
    } catch {
      setNotice("Screen sharing didn't start. Pick a screen, window or tab to share, or allow screen sharing in your browser.");
    }
  };

  // Microphone level, so the teacher can see they're heard.
  useEffect(() => {
    if (!mic || !audio.current) { setLevel(0); return; }
    const an = audio.current.analyser;
    const buf = new Uint8Array(an.fftSize);
    const t = setInterval(() => {
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      setLevel(Math.min(1, peak / 64));
    }, 120);
    return () => clearInterval(t);
  }, [mic]);

  // ---------- Writing ----------
  const pointFrom = (e: { clientX: number; clientY: number }) => {
    const r = outRef.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * W * 10) / 10, Math.round(((e.clientY - r.top) / r.height) * H * 10) / 10];
  };

  const paintLive = () => {
    const L = live.current, s = L.current;
    if (!s || !L.liveCanvas) return;
    if (s.tool === "eraser") {
      const layer = layerFor();
      if (layer) { const ctx = layer.canvas.getContext("2d")!; strokePath(ctx, { ...s, pts: s.pts.slice(-6) }); }
      return;
    }
    const ctx = L.liveCanvas.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    strokePath(ctx, s);
  };

  function finishStroke() {
    const L = live.current, s = L.current;
    if (!s) return;
    L.current = null;
    const layer = layerFor();
    if (layer && s.pts.length >= 2) {
      layer.history.push(layer.strokes);
      if (layer.history.length > 100) layer.history.shift();
      layer.strokes = [...layer.strokes, s];
      if (s.tool !== "eraser") strokePath(layer.canvas.getContext("2d")!, s);
    }
    L.liveCanvas?.getContext("2d")!.clearRect(0, 0, W, H);
    bump((n) => n + 1);
  }

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (!layerFor()) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    live.current.current = { tool, color, size, pts: pointFrom(e) };
    paintLive();
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = live.current.current;
    if (!s) return;
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of evs.length ? evs : [e.nativeEvent]) s.pts.push(...pointFrom(ev));
    if (s.pts.length > 20_000) { finishStroke(); return; }
    paintLive();
  };

  const undo = useCallback(() => {
    const layer = layerFor();
    const prev = layer?.history.pop();
    if (!layer || !prev) return;
    layer.strokes = prev; redraw(layer); bump((n) => n + 1);
  }, [layerFor]);
  const clearInk = () => {
    const layer = layerFor();
    if (!layer || !layer.strokes.length) return;
    layer.history.push(layer.strokes); layer.strokes = []; redraw(layer); bump((n) => n + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); undo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  // ---------- Whiteboard pages ----------
  const addBoard = () => {
    const L = live.current;
    if (L.boards.length >= 20) return;
    L.boards = [...L.boards, { bg: L.boards[L.page]?.bg ?? "white", layer: newLayer() }];
    setBoards(L.boards);
    show("board", L.boards.length - 1);
  };
  const setBg = (bg: BoardBg) => {
    const L = live.current;
    L.boards = L.boards.map((b, i) => (i === L.page ? { ...b, bg } : b));
    setBoards(L.boards);
    if (bg === "chalk" && color === "#111827") setColor("#ffffff");
    if (bg !== "chalk" && color === "#ffffff") setColor("#111827");
  };

  // ---------- Recording ----------
  const busy = phase.s === "countdown" || phase.s === "recording" || phase.s === "uploading" || phase.s === "review";
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const begin = () => {
    const a = ensureAudio();
    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t))!;
    const video = outRef.current!.captureStream(FPS).getVideoTracks();
    const recorder = new MediaRecorder(new MediaStream([...video, ...a.dest.stream.getAudioTracks()]), { mimeType: mime, videoBitsPerSecond: 3_000_000 });
    const r = { recorder, chunks: [] as Blob[], acc: 0, since: Date.now() as number | null };
    rec.current = r;
    recorder.ondataavailable = (e) => { if (e.data.size) r.chunks.push(e.data); };
    recorder.onstop = () => {
      video.forEach((t) => t.stop());
      const durationSec = Math.max(1, Math.round(r.acc / 1000));
      const blob = new Blob(r.chunks, { type: "video/webm" });
      setElapsed(r.acc / 1000);
      setPhase({ s: "review", url: URL.createObjectURL(blob), blob, durationSec });
    };
    recorder.start(1000);
    setChapters(addChapter([], 0, sceneTitle(live.current.scene, live.current.page)));
    setElapsed(0);
    setPhase({ s: "recording", paused: false });
  };

  const start = () => {
    setNotice(null);
    if (typeof MediaRecorder === "undefined" || !outRef.current?.captureStream) return setNotice("This browser can't record video. Use Chrome, Edge or Firefox on a computer.");
    if (!["video/webm;codecs=vp8,opus", "video/webm"].some((t) => MediaRecorder.isTypeSupported(t))) return setNotice("This browser can't record WebM video. Use Chrome, Edge or Firefox on a computer.");
    void ensureAudio().ctx.resume();
    let n = 3;
    setPhase({ s: "countdown", n });
    const t = setInterval(() => {
      n -= 1;
      if (n > 0) return setPhase({ s: "countdown", n });
      clearInterval(t);
      begin();
    }, 1000);
  };

  const pause = () => {
    const r = rec.current;
    if (!r || r.recorder.state !== "recording") return;
    r.recorder.pause();
    if (r.since != null) { r.acc += Date.now() - r.since; r.since = null; }
    setPhase({ s: "recording", paused: true });
  };
  const resume = () => {
    const r = rec.current;
    if (!r || r.recorder.state !== "paused") return;
    r.recorder.resume();
    r.since = Date.now();
    setPhase({ s: "recording", paused: false });
  };
  const stop = () => {
    const r = rec.current;
    if (!r || r.recorder.state === "inactive") return;
    if (r.since != null) { r.acc += Date.now() - r.since; r.since = null; }
    finishStroke();
    r.recorder.stop();
  };

  const discard = () => {
    if (phase.s === "review") URL.revokeObjectURL(phase.url);
    rec.current = null;
    setChapters([]); setElapsed(0);
    setPhase({ s: "setup" });
  };

  const fileName = studioFileName(title, new Date());
  const save = async () => {
    if (phase.s !== "review") return;
    const { blob, durationSec, url } = phase;
    if (blob.size > MAX_UPLOAD) return setNotice("This recording is over 2 GB, too big to upload. Download it instead.");
    setNotice(null);
    setPhase({ s: "uploading", pct: 0 });
    try {
      const up = await upload(`recordings/${fileName}`, blob, {
        access: "public", handleUploadUrl: "/api/recordings/upload", contentType: "video/webm", multipart: blob.size > 100 * 1024 * 1024,
        onUploadProgress: (e) => setPhase({ s: "uploading", pct: Math.round(e.percentage) }),
      });
      setPhase({ s: "done" });
      URL.revokeObjectURL(url);
      const q = new URLSearchParams({ studio: "1", video: up.url, duration: String(durationSec), title: title.trim(), chapters: encodeChapters(chapters) });
      router.push(`/teacher/recordings/new?${q}`);
    } catch {
      setPhase({ s: "review", url, blob, durationSec });
      setNotice("The upload didn't work. Try again, or download the recording so it isn't lost.");
    }
  };

  const layer = layerFor();
  const canWrite = scene === "board" || (scene === "camera" ? !!cam : !!screen);
  const locked = phase.s === "review" || phase.s === "uploading" || phase.s === "done";
  const board = boards[page];

  return (
    <div className="grid gap-4">
      <section className="card gap-3" aria-label="Studio">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="What to show" className="flex flex-wrap gap-1 rounded-xl border border-line p-1">
            <SceneButton on={scene === "board"} onClick={() => show("board")} icon="board" label="Whiteboard" disabled={locked} />
            <SceneButton on={scene === "screen"} onClick={() => void shareScreen()} icon="screen" label={screen ? "Screen" : "Share screen"} disabled={locked || !canShare} />
            <SceneButton on={scene === "camera"} onClick={() => (cam ? show("camera") : void toggleCamera(true))} icon="video" label="Camera" disabled={locked} />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-sm" aria-pressed={!!cam} onClick={() => void toggleCamera()} disabled={locked}>
              <Icon name="video" /> {cam ? "Camera on" : "Camera off"}
            </button>
            <button type="button" className="btn btn-sm" aria-pressed={!!mic} onClick={() => void toggleMic()} disabled={locked}>
              <Icon name={mic ? "mic" : "micOff"} /> {mic ? "Mic on" : "Mic off"}
              {mic && <span aria-hidden className="ml-1 inline-block h-2 w-10 overflow-hidden rounded bg-line"><span className="block h-full bg-good transition-[width]" style={{ width: `${Math.round(level * 100)}%` }} /></span>}
            </button>
            {screen && <button type="button" className="btn btn-sm" onClick={stopScreen} disabled={locked}>Stop sharing</button>}
            <label className="flex items-center gap-1 text-xs text-muted">Face bubble
              <select className="input py-1 text-xs" value={bubble ?? "off"} onChange={(e) => setBubble(e.target.value === "off" ? null : (e.target.value as Corner))} disabled={locked}>
                <option value="br">Bottom right</option><option value="bl">Bottom left</option><option value="tr">Top right</option><option value="tl">Top left</option><option value="off">Hidden</option>
              </select>
            </label>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl bg-[#0f172a]">
          <canvas ref={outRef} width={W} height={H} aria-label={`Studio view: ${sceneTitle(scene, page)}. Draw here to write.`}
            className={`block aspect-video w-full touch-none ${canWrite && !locked ? (tool === "eraser" ? "cursor-cell" : "cursor-crosshair") : ""}`}
            onPointerDown={locked ? undefined : onDown} onPointerMove={onMove} onPointerUp={finishStroke} onPointerCancel={finishStroke} />
          {phase.s === "countdown" && <div className="absolute inset-0 grid place-items-center bg-black/40 text-7xl font-bold text-white" role="status" aria-live="assertive">{phase.n}</div>}
          {phase.s === "recording" && (
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm font-bold text-white" role="status">
              <span className={`h-2.5 w-2.5 rounded-full ${phase.paused ? "bg-warn" : "animate-pulse bg-bad"}`} aria-hidden />
              {phase.paused ? "Paused" : "Recording"} <span className="tnum">{fmtClock(elapsed)}</span>
            </div>
          )}
          <video ref={camVideo} muted playsInline className="hidden" />
          <video ref={screenVideo} muted playsInline className="hidden" />
        </div>

        {!locked && (
          <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Writing tools">
            <div className="flex gap-1">
              <ToolButton on={tool === "pen"} onClick={() => setTool("pen")} icon="pen" label="Pen" />
              <ToolButton on={tool === "highlighter"} onClick={() => setTool("highlighter")} icon="highlighter" label="Highlighter" />
              <ToolButton on={tool === "eraser"} onClick={() => setTool("eraser")} icon="eraser" label="Eraser" />
            </div>
            <div className="flex gap-1" role="group" aria-label="Colour">
              {COLORS.map((c) => (
                <button key={c.v} type="button" aria-label={c.name} aria-pressed={color === c.v} title={c.name} onClick={() => { setColor(c.v); if (tool === "eraser") setTool("pen"); }}
                  className={`h-7 w-7 rounded-full border-2 ${color === c.v ? "border-brand ring-2 ring-brand/40" : "border-line"}`} style={{ background: c.v }} />
              ))}
            </div>
            <div className="flex gap-1" role="group" aria-label="Line size">
              {SIZES.map((s) => (
                <button key={s.v} type="button" className={`btn btn-sm ${size === s.v ? "border-brand text-brand" : ""}`} aria-pressed={size === s.v} onClick={() => setSize(s.v)}>
                  <span aria-hidden className="inline-block rounded-full bg-current" style={{ width: s.v + 2, height: s.v + 2 }} /> {s.name}
                </button>
              ))}
            </div>
            <div className="ml-auto flex gap-1">
              <button type="button" className="btn btn-sm" onClick={undo} disabled={!layer?.history.length} title="Undo (Ctrl+Z)"><Icon name="undo" /> Undo</button>
              <button type="button" className="btn btn-sm" onClick={clearInk} disabled={!layer?.strokes.length}>{scene === "board" ? "Clear board" : "Clear writing"}</button>
            </div>
          </div>
        )}

        {scene === "board" && !locked && board && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">Pages</span>
            {boards.map((_, i) => (
              <button key={i} type="button" className={`btn btn-sm ${i === page ? "border-brand text-brand" : ""}`} aria-pressed={i === page} onClick={() => show("board", i)}>Board {i + 1}</button>
            ))}
            {boards.length < 20 && <button type="button" className="btn btn-sm" onClick={addBoard}>+ New page</button>}
            <label className="ml-auto flex items-center gap-1 text-xs text-muted">Background
              <select className="input py-1 text-xs" value={board.bg} onChange={(e) => setBg(e.target.value as BoardBg)}>
                {(Object.keys(BG) as BoardBg[]).map((k) => <option key={k} value={k}>{BG[k]}</option>)}
              </select>
            </label>
          </div>
        )}
        {scene === "screen" && screen && !locked && <p className="text-xs text-muted">Write over your screen with the pen. The writing stays on top until you clear it. You can switch to the app you&apos;re sharing; keep this tab open so the recording continues.</p>}
        {!canShare && <p className="text-xs text-muted">Screen sharing needs Chrome, Edge or Firefox on a computer.</p>}
        {notice && <p role="alert" className="text-sm text-bad">{notice}</p>}
      </section>

      <section className="card gap-3" aria-label="Recording">
        {(phase.s === "setup" || phase.s === "countdown") && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid flex-1 gap-1 text-sm font-bold">Recording title
              <input className="input font-normal" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Equivalent fractions, part 2" />
            </label>
            <button type="button" className="btn-primary" onClick={start} disabled={phase.s === "countdown"}><Icon name="record" /> Start recording</button>
          </div>
        )}
        {phase.s === "setup" && !mic && <p className="text-xs text-muted">Turn your mic on so students can hear you. You can switch views, add whiteboard pages and write at any time while recording.</p>}
        {phase.s === "recording" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="tnum text-lg font-bold">{fmtClock(elapsed)}</span>
            {phase.paused
              ? <button type="button" className="btn" onClick={resume}><Icon name="record" className="text-bad" /> Resume</button>
              : <button type="button" className="btn" onClick={pause}><Icon name="pause" /> Pause</button>}
            <button type="button" className="btn" onClick={() => mark(`Chapter ${chapters.length + 1}`)}><Icon name="flag" /> Mark chapter</button>
            <button type="button" className="btn-primary ml-auto" onClick={stop}>Stop recording</button>
          </div>
        )}
        {phase.s === "review" && (
          <div className="grid gap-3">
            <h2 className="text-lg">Your recording · {fmtClock(phase.durationSec)}</h2>
            <video src={phase.url} controls playsInline className="aspect-video w-full rounded-xl bg-black" aria-label="Recording preview" />
            <div className="flex flex-wrap gap-2">
              {uploadEnabled
                ? <button type="button" className="btn-primary" onClick={() => void save()}>Save and add details</button>
                : <p className="text-sm text-muted">Video storage isn&apos;t connected, so download the recording and upload it as a recorded class.</p>}
              <a className="btn" href={phase.url} download={fileName}><Icon name="download" /> Download</a>
              <button type="button" className="btn text-bad" onClick={() => { if (window.confirm("Delete this recording and start again?")) discard(); }}>Record again</button>
            </div>
          </div>
        )}
        {phase.s === "uploading" && (
          <div role="status" className="grid gap-2">
            <p className="text-sm font-bold">Uploading your recording… {phase.pct}%</p>
            <div className="h-2 overflow-hidden rounded bg-line"><div className="h-full bg-brand" style={{ width: `${phase.pct}%` }} /></div>
            <p className="text-xs text-muted">Keep this tab open until it finishes.</p>
          </div>
        )}
        {phase.s === "done" && <p role="status" className="text-sm font-bold text-good">Uploaded. Opening the recording form…</p>}

        {chapters.length > 0 && phase.s !== "done" && (
          <div>
            <h3 className="text-sm font-bold">Chapters</h3>
            <p className="text-xs text-muted">Marked when you switch views. You can rename them on the next page.</p>
            <ol className="mt-1 grid gap-0.5 text-sm" aria-label="Chapters">
              {chapters.map((c, i) => <li key={i}><span className="tnum text-muted">{fmtClock(c.t)}</span> {c.title}</li>)}
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}

function SceneButton({ on, onClick, icon, label, disabled }: { on: boolean; onClick: () => void; icon: "board" | "screen" | "video"; label: string; disabled?: boolean }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} disabled={disabled}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold disabled:opacity-50 ${on ? "bg-brand text-white" : "hover:bg-line/60"}`}>
      <Icon name={icon} /> {label}
    </button>
  );
}

function ToolButton({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: "pen" | "highlighter" | "eraser"; label: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`btn btn-sm ${on ? "border-brand text-brand" : ""}`}><Icon name={icon} /> {label}</button>
  );
}
