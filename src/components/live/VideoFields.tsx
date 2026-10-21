"use client";
import { useState } from "react";
import { PROVIDER_LABEL, type VideoProvider } from "@/lib/live-utils";

const HELP: Record<VideoProvider, string> = {
  educop: "Video inside Educop: your camera, mic and screen share, students invited to speak, and a free recording. Beta.",
  teams: "Create the meeting in Teams or Outlook, then paste its join link.",
  meet: "Create the meeting in Google Meet or Calendar, then paste its join link.",
  jitsi: "A free room embedded in Educop. Good for trying things out; calls may be time-limited.",
};

/**
 * Video service picker shared by the schedule form and the class page.
 * `educopEnabled` comes from the server: Educop live needs LiveKit settings.
 */
export function VideoFields({ provider, meetingUrl = "", educopEnabled = false }: { provider?: VideoProvider; meetingUrl?: string; educopEnabled?: boolean }) {
  const [p, setP] = useState<VideoProvider>(provider ?? (educopEnabled ? "educop" : "teams"));
  const external = p === "teams" || p === "meet";
  return (
    <div className="flex flex-col gap-3">
      <label className="label">Video
        <select className="input" name="provider" value={p} onChange={(e) => setP(e.target.value as VideoProvider)}>
          {(["educop", "teams", "meet", "jitsi"] as const).map((k) => (
            <option key={k} value={k} disabled={k === "educop" && !educopEnabled}>
              {PROVIDER_LABEL[k]}{k === "educop" && !educopEnabled ? " · Needs a LiveKit account (free plan works)" : ""}
            </option>
          ))}
        </select>
      </label>
      {external && (
        <label className="label">{PROVIDER_LABEL[p]} join link
          <input className="input" type="url" name="meetingUrl" required defaultValue={meetingUrl} maxLength={2000}
            placeholder={p === "teams" ? "https://teams.microsoft.com/l/meetup-join/…" : "https://meet.google.com/abc-defg-hij"} />
        </label>
      )}
      {p === "educop" && !educopEnabled
        ? <p className="text-xs font-bold text-warn">Educop live isn&apos;t set up yet. Needs a LiveKit account (free plan works). Choose another video service for now.</p>
        : <p className="text-xs text-muted">{HELP[p]}</p>}
      {p !== "educop" && !educopEnabled && <p className="text-xs text-muted">Educop live (beta) is off: it needs a LiveKit account (free plan works).</p>}
    </div>
  );
}
