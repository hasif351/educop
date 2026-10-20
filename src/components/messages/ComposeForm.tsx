"use client";
import { useActionState, useRef } from "react";
import { keepValues } from "@/components/submit";
import { sendMessage, type MessageState } from "@/app/actions-messages";
import { Icon } from "@/components/icons";

type Pair = { value: string; label: string };

/** Message box with optional templates. With `pairs`, the sender also picks who and which child. */
export function ComposeForm({ to, student, pairs, templates, recipientName }: {
  to?: string; student?: string; pairs?: Pair[]; templates: { label: string; text: string }[]; recipientName?: string;
}) {
  const [state, action, pending] = useActionState<MessageState, FormData>(sendMessage, {});
  const body = useRef<HTMLTextAreaElement>(null);
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-3">
      {to && student && <><input type="hidden" name="to" value={to} /><input type="hidden" name="student" value={student} /></>}
      {pairs && (
        <label className="label">To
          <select className="input" name="pair" required defaultValue="">
            <option value="" disabled>Choose a person</option>
            {pairs.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
      )}
      <label className="label">Template
        <select className="input" defaultValue="" onChange={(e) => { const t = templates.find((x) => x.label === e.target.value); if (t && body.current) body.current.value = t.text; }}>
          <option value="">No template</option>
          {templates.map((t) => <option key={t.label}>{t.label}</option>)}
        </select>
      </label>
      <label className="label">Message{recipientName && <span className="sr-only"> to {recipientName}</span>}
        <textarea ref={body} className="input" name="body" rows={4} maxLength={2000} required />
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}><Icon name="send" /> {pending ? "Sending…" : "Send"}</button>
        <p className="text-xs text-muted">Messages go through the school platform and are kept in the school record. Phone numbers, emails and links are held for review.</p>
      </div>
    </form>
  );
}
