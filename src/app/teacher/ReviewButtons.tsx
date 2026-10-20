"use client";
import { useTransition } from "react";
import { reviewRecommendation } from "./actions";

export function ReviewButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <button className="btn-primary btn-sm" disabled={pending} onClick={() => start(() => reviewRecommendation(id, "approve"))}>Approve</button>
      <button className="btn btn-sm" disabled={pending} onClick={() => start(() => reviewRecommendation(id, "dismiss"))}>Dismiss</button>
    </div>
  );
}
