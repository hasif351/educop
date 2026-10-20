"use client";
import { useTransition } from "react";
import { setLessonStatus } from "../actions";

export function LessonStatusButton({ id, status }: { id: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED" }) {
  const [pending, start] = useTransition();
  if (status === "PUBLISHED") return <button className="btn btn-sm" disabled={pending} onClick={() => start(() => setLessonStatus(id, "DRAFT"))}>Unpublish</button>;
  return <button className="btn-primary btn-sm" disabled={pending} onClick={() => start(() => setLessonStatus(id, "PUBLISHED"))}>Publish</button>;
}
