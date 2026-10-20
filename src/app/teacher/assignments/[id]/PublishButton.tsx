"use client";
import { useTransition } from "react";
import { publishAssignment } from "../../actions";

export function PublishButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <button className="btn-primary" disabled={pending} onClick={() => start(() => publishAssignment(id))}>{pending ? "Publishing…" : "Publish to class"}</button>;
}
