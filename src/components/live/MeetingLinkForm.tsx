"use client";
import { useActionState } from "react";
import { keepValues } from "@/components/submit";
import { setMeetingLink, type LiveFormState } from "@/app/teacher/live/actions";
import type { VideoProvider } from "@/lib/live-utils";
import { VideoFields } from "./VideoFields";

export function MeetingLinkForm({ id, provider, meetingUrl }: { id: string; provider: VideoProvider; meetingUrl: string }) {
  const [state, action, pending] = useActionState<LiveFormState, FormData>(setMeetingLink.bind(null, id), {});
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-3">
      <VideoFields provider={provider} meetingUrl={meetingUrl} />
      {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-lg bg-good-soft px-3 py-2 text-sm font-bold text-good">{state.ok}</p>}
      <button className="btn self-start" disabled={pending}>{pending ? "Saving…" : "Save video link"}</button>
    </form>
  );
}
