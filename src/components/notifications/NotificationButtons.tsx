"use client";
import { useTransition } from "react";
import { markAllNotificationsRead, markNotificationRead, openNotification } from "@/app/actions-account";
import { Icon } from "@/components/icons";

export function MarkAllRead() {
  const [pending, start] = useTransition();
  return <button className="btn" disabled={pending} onClick={() => start(() => markAllNotificationsRead())}><Icon name="check" /> {pending ? "Marking…" : "Mark all as read"}</button>;
}

export function NotificationActions({ id, unread, hasLink, title }: { id: string; unread: boolean; hasLink: boolean; title: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-none flex-col items-end gap-1.5 sm:flex-row sm:items-center">
      {hasLink && <button className="btn btn-sm" disabled={pending} aria-label={`Open: ${title}`} onClick={() => start(() => openNotification(id))}>Open</button>}
      {unread && <button className="btn btn-sm border-0 bg-transparent" disabled={pending} aria-label={`Mark read: ${title}`} onClick={() => start(() => markNotificationRead(id))}>Mark read</button>}
    </div>
  );
}
