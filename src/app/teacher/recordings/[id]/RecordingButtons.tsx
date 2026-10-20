"use client";
import { useTransition } from "react";
import { deleteRecording, setRecordingStatus } from "../actions";

export function RecordingButtons({ id, status }: { id: string; status: "DRAFT" | "PUBLISHED" | "PENDING_APPROVAL" | "ARCHIVED" }) {
  const [pending, start] = useTransition();
  if (status === "PUBLISHED") return <button className="btn" disabled={pending} onClick={() => start(() => setRecordingStatus(id, "DRAFT"))}>Unpublish</button>;
  return (
    <>
      <button className="btn-primary" disabled={pending} onClick={() => start(() => setRecordingStatus(id, "PUBLISHED"))}>{pending ? "Saving…" : "Publish to class"}</button>
      <button className="btn text-bad" disabled={pending} onClick={() => { if (confirm("Delete this draft recording? This can't be undone.")) start(() => deleteRecording(id)); }}>Delete draft</button>
    </>
  );
}
