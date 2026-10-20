"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { NOVA_GREETING, NOVA_MAX_CHARS, SAFETY_MODEL, TEMPLATE_MODEL } from "@/lib/nova";
import { askNova, flagReply, type ChatMsg } from "./actions";

const STARTERS = ["How do I find equal fractions?", "Check my answer: 2/3 = 4/6", "Explain the water cycle simply"];

export function NovaChat({ initial, remaining: startRemaining, limit, online }: { initial: ChatMsg[]; remaining: number; limit: number; online: boolean }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>(initial);
  const [text, setText] = useState("");
  const [remaining, setRemaining] = useState(startRemaining);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [flagging, setFlagging] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => { listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" }); }, [msgs.length]);

  function send(q: string) {
    const question = q.trim();
    if (!question || pending) return;
    setError(null);
    setText("");
    start(async () => {
      const r = await askNova(question).catch(() => ({ error: "Couldn't reach Nova. Check your connection and try again." } as { error: string; messages?: undefined; remaining?: undefined }));
      if (r.error) { setError(r.error); setText(question); return; }
      setMsgs((m) => [...m, ...(r.messages ?? [])]);
      if (r.remaining != null) setRemaining(r.remaining);
    });
  }

  function submitFlag(id: string) {
    start(async () => {
      const r = await flagReply(id, reason);
      if (r.error) { setError(r.error); return; }
      setMsgs((m) => m.map((x) => (x.id === id ? { ...x, flagged: true } : x)));
      setFlagging(null);
      setReason("");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className="card lg:col-span-8" aria-label="Chat with Nova">
        {!online && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm"><b>AI not connected.</b> Nova is using template hints for now, so answers are simpler than usual.</p>}
        <ol ref={listRef} className="flex max-h-[60vh] min-h-64 flex-col gap-3 overflow-y-auto" aria-live="polite" aria-label="Conversation">
          <li className="max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-surface-2 px-3.5 py-2.5 text-sm">{NOVA_GREETING}</li>
          {msgs.map((m) => m.role === "user" ? (
            <li key={m.id} className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-soft px-3.5 py-2.5 text-sm"><span className="sr-only">You: </span>{m.content}</li>
          ) : (
            <li key={m.id} className={`flex max-w-[85%] flex-col gap-1.5 self-start rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm ${m.model === SAFETY_MODEL ? "bg-teal-soft" : "bg-surface-2"}`}>
              <span className="sr-only">Nova: </span>
              {m.model === TEMPLATE_MODEL && <span className="text-xs font-bold text-warn">Template hint (AI not connected)</span>}
              {m.model === SAFETY_MODEL && <span className="text-xs font-bold text-teal">A message from Nova</span>}
              <span className="whitespace-pre-wrap">{m.content}</span>
              {m.model !== SAFETY_MODEL && (m.flagged
                ? <span className="text-xs text-muted">Reported. Thanks, someone at school will check it.</span>
                : flagging === m.id ? (
                  <span className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold" htmlFor={`why-${m.id}`}>What seems wrong? (optional)</label>
                    <input id={`why-${m.id}`} className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
                    <span className="flex gap-2"><button type="button" className="btn btn-sm" onClick={() => submitFlag(m.id)} disabled={pending}>Send report</button><button type="button" className="btn btn-sm" onClick={() => setFlagging(null)}>Cancel</button></span>
                  </span>
                ) : <button type="button" className="self-start text-xs text-muted underline" onClick={() => { setFlagging(m.id); setReason(""); }}>This seems wrong</button>)}
            </li>
          ))}
          {pending && !flagging && <li className="self-start text-sm text-muted" role="status">Nova is thinking…</li>}
        </ol>

        <div className="flex flex-wrap gap-2">
          {STARTERS.map((q) => <button key={q} type="button" className="btn btn-sm" onClick={() => send(q)} disabled={pending || remaining <= 0}>{q}</button>)}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <label htmlFor="nova-in" className="sr-only">Ask Nova a question</label>
          <input id="nova-in" className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={NOVA_MAX_CHARS} placeholder="Ask a question" disabled={remaining <= 0} autoComplete="off" />
          <button className="btn-primary" disabled={pending || !text.trim() || remaining <= 0}>Send</button>
        </form>
        {error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm font-bold text-bad">{error}</p>}
        <p className="text-xs text-muted">{remaining} of {limit} questions left today.</p>
      </section>

      <aside className="flex flex-col gap-4 lg:col-span-4">
        <section className="card text-sm">
          <h2 className="text-lg">How Nova helps</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>Hints and questions first, so you do the thinking.</li>
            <li>It won&apos;t do your homework for you, but it will help you get unstuck.</li>
            <li>AI can make mistakes. If a reply seems wrong, tap &ldquo;This seems wrong&rdquo;.</li>
          </ul>
        </section>
        <section className="card bg-teal-soft text-sm">
          <h2 className="text-lg">Something on your mind?</h2>
          <p>If you feel upset, unsafe or someone is being unkind to you, please talk to your teacher, the school counsellor or another trusted adult. Nova is only a study buddy.</p>
        </section>
        <section className="card text-sm">
          <h2 className="text-lg">Privacy</h2>
          <p>Nova never shares your chats with classmates. Don&apos;t share personal details like your phone number or address. Staff at your school can see a message only if it&apos;s held for safety or you report a reply.</p>
        </section>
      </aside>
    </div>
  );
}
