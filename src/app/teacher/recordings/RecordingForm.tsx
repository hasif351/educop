"use client";
import { useActionState, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { keepValues } from "@/components/submit";
import { fmtClock, newQuestionId, parseVideoUrl, videoSources } from "@/lib/recordings";
import { saveRecording, type RecordingFormState } from "./actions";

type ChapterRow = { time: string; title: string };
type QuestionRow = { id: string; time: string; prompt: string; options: string[]; answerIndex: number; explanation: string };
export type RecordingDefaults = {
  classId: string; lessonId: string; liveSessionId: string; title: string; description: string; videoUrl: string;
  durationSec: number | null; captions: string; chapters: ChapterRow[]; questions: QuestionRow[]; published: boolean;
};
type ClassOpt = { id: string; name: string; lessons: { id: string; title: string }[] };

const MAX_UPLOAD = 2 * 1024 * 1024 * 1024;
const newQ = (): QuestionRow => ({ id: newQuestionId(), time: "", prompt: "", options: ["", ""], answerIndex: 0, explanation: "" });

export function RecordingForm({ recordingId, classes, defaults, uploadEnabled }: { recordingId: string | null; classes: ClassOpt[]; defaults: RecordingDefaults; uploadEnabled: boolean }) {
  const [state, action, pending] = useActionState<RecordingFormState, FormData>(saveRecording.bind(null, recordingId), {});
  const [classId, setClassId] = useState(defaults.classId);
  const lessons = useMemo(() => classes.find((c) => c.id === classId)?.lessons ?? [], [classes, classId]);
  const [videoUrl, setVideoUrl] = useState(defaults.videoUrl);
  const [duration, setDuration] = useState<number | null>(defaults.durationSec);
  const [probe, setProbe] = useState<"idle" | "ok" | "bad">(defaults.durationSec ? "ok" : "idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [chapters, setChapters] = useState<ChapterRow[]>(defaults.chapters);
  const [qs, setQs] = useState<QuestionRow[]>(defaults.questions);
  const fileRef = useRef<HTMLInputElement>(null);

  const linkCheck = videoUrl.trim() ? parseVideoUrl(videoUrl) : null;
  const linkError = linkCheck && "error" in linkCheck ? linkCheck.error : "";
  const changeVideo = (url: string) => { setVideoUrl(url); setDuration(null); setProbe("idle"); };

  async function onUpload() {
    const file = fileRef.current?.files?.[0];
    setUploadError("");
    if (!file) return setUploadError("Choose a video file first.");
    if (!/\.(mp4|webm|mov)$/i.test(file.name)) return setUploadError("Choose an .mp4, .webm or .mov file.");
    if (file.size > MAX_UPLOAD) return setUploadError("Videos can be up to 2 GB.");
    setProgress(0);
    try {
      const safe = file.name.replace(/[^\w .()-]/g, "_").slice(-100);
      const blob = await upload(`recordings/${safe}`, file, {
        access: "public", handleUploadUrl: "/api/recordings/upload", multipart: file.size > 100 * 1024 * 1024,
        onUploadProgress: (e) => setProgress(Math.round(e.percentage)),
      });
      changeVideo(blob.url);
      setProgress(100);
    } catch (e) {
      setProgress(null);
      setUploadError(e instanceof Error ? e.message : "Upload failed. Try again.");
    }
  }

  const updC = (i: number, p: Partial<ChapterRow>) => setChapters(chapters.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const updQ = (i: number, p: Partial<QuestionRow>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...p } : q)));

  return (
    <form onSubmit={keepValues(action)} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <input type="hidden" name="liveSessionId" value={defaults.liveSessionId} />
      <div className="flex flex-col gap-6">
        <div className="card gap-4">
          <h2 className="text-lg">Details</h2>
          <label className="label">Class
            <select className="input" name="classId" value={classId} onChange={(e) => setClassId(e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </label>
          <label className="label">Linked lesson <span className="text-xs font-normal text-muted">Optional</span>
            <select className="input" name="lessonId" defaultValue={defaults.lessonId} key={classId}><option value="">None</option>{lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</select>
          </label>
          <label className="label">Title<input className="input" name="title" defaultValue={defaults.title} required maxLength={160} /></label>
          <label className="label">Description <span className="text-xs font-normal text-muted">What students will learn, and what to do after watching</span>
            <textarea className="input" name="description" rows={3} maxLength={2000} defaultValue={defaults.description} />
          </label>
        </div>

        <div className="card gap-4">
          <h2 className="text-lg">Video</h2>
          {uploadEnabled ? (
            <div className="flex flex-col gap-2">
              <label className="label">Upload a video file <span className="text-xs font-normal text-muted">.mp4, .webm or .mov, up to 2 GB</span>
                <input ref={fileRef} className="input" type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" />
              </label>
              <button type="button" className="btn self-start" onClick={onUpload} disabled={progress != null && progress < 100}>Upload video</button>
              {progress != null && (
                <div className="flex items-center gap-2 text-xs">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Upload progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-teal" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="tnum w-24 text-right">{progress === 100 ? "Uploaded" : `${progress}%`}</span>
                </div>
              )}
              {uploadError && <p role="alert" className="text-sm font-bold text-bad">{uploadError}</p>}
            </div>
          ) : (
            <p className="rounded-lg bg-surface-2 p-3 text-sm">Video upload needs storage to be connected (Vercel Blob); for now paste a video link.</p>
          )}
          <label className="label">{uploadEnabled ? "Or paste a video link" : "Video link"}
            <input className="input" name="videoUrl" value={videoUrl} onChange={(e) => changeVideo(e.target.value)} placeholder="https://…/lesson.mp4" maxLength={2000} />
          </label>
          {linkError ? <p className="text-sm text-bad">{linkError}</p> : (
            <p className="text-xs text-muted">The link must go straight to a video file (.mp4, .webm or .mov). YouTube, Teams, Stream and Google Drive links open a page, not a file, so they can&apos;t play here.</p>
          )}
          <p className="text-xs text-muted"><b>Teams or Meet class?</b> Download the recording (Teams: from the meeting chat or OneDrive; Meet: from Google Drive), then upload the file here.</p>
          {/* Reads the video's length so chapter and question times can be checked. */}
          {linkCheck && "url" in linkCheck && (
            <video key={linkCheck.url} preload="metadata" muted className="hidden"
              onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d)) { setDuration(Math.round(d)); setProbe("ok"); } }}>
              {videoSources(linkCheck.url).map((x, i, all) => <source key={x.src} src={x.src} type={x.type} onError={i === all.length - 1 ? () => setProbe("bad") : undefined} />)}
            </video>
          )}
          {probe === "ok" && duration != null && <p role="status" className="text-sm text-good">Video found · {fmtClock(duration)} long.</p>}
          {probe === "bad" && <p role="status" className="text-sm text-warn">This link didn&apos;t load as a video in your browser. Check it opens and plays on its own.</p>}
          <input type="hidden" name="durationSec" value={duration ?? ""} />
        </div>

        <div className="card gap-3">
          <h2 className="text-lg">Captions</h2>
          <label className="label">Captions or transcript <span className="text-xs font-normal text-muted">Paste WebVTT, or one line per caption starting with a time, like “00:12 Today we look at fractions”.</span>
            <textarea className="input font-mono text-xs" name="captions" rows={6} maxLength={100_000} defaultValue={defaults.captions} placeholder={"00:00 Hello 5B!\n00:05 Today: equivalent fractions"} />
          </label>
          <p className="text-xs text-muted">Teams and Meet can save a transcript (.vtt) with the recording. Paste it here so students can read along.</p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="card gap-3">
          <div className="flex items-center justify-between gap-2"><h2 className="text-lg">Chapters</h2><span className="text-xs text-muted">Times like 1:30</span></div>
          {chapters.length === 0 && <p className="text-sm text-muted">Chapters help students find their way around a long video.</p>}
          {chapters.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="input w-20" value={c.time} onChange={(e) => updC(i, { time: e.target.value })} aria-label={`Chapter ${i + 1} time`} placeholder="0:00" maxLength={12} />
              <input className="input" value={c.title} onChange={(e) => updC(i, { title: e.target.value })} aria-label={`Chapter ${i + 1} title`} placeholder="Title" maxLength={120} />
              <button type="button" className="btn btn-sm" aria-label={`Remove chapter ${i + 1}`} onClick={() => setChapters(chapters.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          {chapters.length < 50 && <button type="button" className="btn btn-sm self-start" onClick={() => setChapters([...chapters, { time: "", title: "" }])}>+ Add chapter</button>}
          <input type="hidden" name="chapters" value={JSON.stringify(chapters)} />
        </div>

        <div className="card gap-3">
          <h2 className="text-lg">Questions in the video</h2>
          <p className="text-sm text-muted">The video pauses at each question. Students answer before they can continue or skip past it.</p>
          {qs.map((q, i) => (
            <fieldset key={q.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
              <legend className="px-1 text-sm font-bold">Question {i + 1}</legend>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs font-bold">Pause at<input className="input w-20" value={q.time} onChange={(e) => updQ(i, { time: e.target.value })} aria-label={`Question ${i + 1} time`} placeholder="1:30" maxLength={12} /></label>
                <span className="flex-1" />
                <button type="button" className="btn btn-sm text-bad" onClick={() => setQs(qs.filter((_, j) => j !== i))}>Delete question {i + 1}</button>
              </div>
              <textarea className="input" rows={2} value={q.prompt} onChange={(e) => updQ(i, { prompt: e.target.value })} aria-label={`Question ${i + 1}`} placeholder="Question" maxLength={500} />
              <span className="text-xs text-muted">Select the correct answer</span>
              {q.options.map((o, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input type="radio" name={`correct-${q.id}`} checked={q.answerIndex === oi} onChange={() => updQ(i, { answerIndex: oi })} aria-label={`Question ${i + 1} option ${oi + 1} is correct`} />
                  <input className="input" value={o} onChange={(e) => updQ(i, { options: q.options.map((x, k) => (k === oi ? e.target.value : x)) })} aria-label={`Question ${i + 1} option ${oi + 1}`} placeholder={`Option ${oi + 1}`} maxLength={200} />
                  {q.options.length > 2 && <button type="button" className="btn btn-sm" aria-label={`Remove option ${oi + 1}`} onClick={() => updQ(i, { options: q.options.filter((_, k) => k !== oi), answerIndex: q.answerIndex >= oi && q.answerIndex > 0 ? q.answerIndex - 1 : q.answerIndex })}>×</button>}
                </div>
              ))}
              {q.options.length < 6 && <button type="button" className="btn btn-sm self-start" onClick={() => updQ(i, { options: [...q.options, ""] })}>Add option</button>}
              <label className="label text-xs">Explanation shown after answering<input className="input" value={q.explanation} onChange={(e) => updQ(i, { explanation: e.target.value })} aria-label={`Question ${i + 1} explanation`} maxLength={500} /></label>
            </fieldset>
          ))}
          {qs.length < 20 && <button type="button" className="btn btn-sm self-start" onClick={() => setQs([...qs, newQ()])}>+ Add question</button>}
          <input type="hidden" name="questions" value={JSON.stringify(qs)} />
        </div>

        {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>}
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {!defaults.published && <button className="btn" name="intent" value="draft" disabled={pending}>Save draft</button>}
          <button className="btn-primary" name="intent" value="publish" disabled={pending}>{pending ? "Saving…" : defaults.published ? "Save changes" : "Publish to class"}</button>
        </div>
        <p className="text-xs text-muted">Publishing notifies the students in the class. Students earn points when they watch at least 90% and answer every question.</p>
      </div>
    </form>
  );
}
