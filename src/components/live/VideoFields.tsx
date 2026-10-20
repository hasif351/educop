"use client";
import { useState } from "react";
import { PROVIDER_LABEL, type VideoProvider } from "@/lib/live-utils";

const HELP: Record<VideoProvider, string> = {
  teams: "Create the meeting in Teams or Outlook, then paste its join link.",
  meet: "Create the meeting in Google Meet or Calendar, then paste its join link.",
  jitsi: "A free room embedded in Educop. Good for trying things out; calls may be time-limited.",
};

/** Video service picker shared by the schedule form and the class page. */
export function VideoFields({ provider = "teams", meetingUrl = "" }: { provider?: VideoProvider; meetingUrl?: string }) {
  const [p, setP] = useState<VideoProvider>(provider);
  return (
    <div className="flex flex-col gap-3">
      <label className="label">Video
        <select className="input" name="provider" value={p} onChange={(e) => setP(e.target.value as VideoProvider)}>
          {(["teams", "meet", "jitsi"] as const).map((k) => <option key={k} value={k}>{PROVIDER_LABEL[k]}</option>)}
        </select>
      </label>
      {p !== "jitsi" && (
        <label className="label">{PROVIDER_LABEL[p]} join link
          <input className="input" type="url" name="meetingUrl" required defaultValue={meetingUrl} maxLength={2000}
            placeholder={p === "teams" ? "https://teams.microsoft.com/l/meetup-join/…" : "https://meet.google.com/abc-defg-hij"} />
        </label>
      )}
      <p className="text-xs text-muted">{HELP[p]}</p>
    </div>
  );
}
