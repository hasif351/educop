import Link from "next/link";
import { conversations, messageContacts, thread } from "@/lib/messages";
import { timeAgo } from "@/lib/datetime";
import { ROLE_HOME } from "@/lib/roles";
import type { SessionPayload } from "@/lib/session";
import { Chip, Empty, PageHeader, fmtDate, fmtTime } from "@/components/ui";
import { ComposeForm } from "./ComposeForm";

type S = SessionPayload & { schoolId: string };

const TEMPLATES = {
  PARENT: (teacher: string, child: string) => [
    { label: "General question", text: `Hi ${teacher}, thank you for the update. How can we help ${child} practise at home?` },
    { label: "Request a meeting", text: `Hi ${teacher}, could we find a time to meet about ${child}'s progress? We are free most afternoons this week.` },
    { label: "Absence note", text: `Hi ${teacher}, ${child} will be absent tomorrow. Could you let us know what to catch up on?` },
  ],
  TEACHER: (parent: string, child: string) => [
    { label: "Progress update", text: `Hello ${parent}, a quick update on ${child}: ` },
    { label: "Celebrate a success", text: `Hello ${parent}, I wanted to share that ${child} did really well this week: ` },
    { label: "Request a meeting", text: `Hello ${parent}, could we arrange a short meeting about ${child}? Please let me know a time that suits you.` },
  ],
};

const first = (name: string) => name.split(" ")[0];

/** Shared by /parent/messages and /teacher/messages. */
export async function MessagesPage({ s, withId, studentId, held }: { s: S; withId?: string; studentId?: string; held?: boolean }) {
  const role = s.role === "PARENT" ? "PARENT" : "TEACHER";
  const home = ROLE_HOME[s.role];
  const [convos, contacts] = await Promise.all([conversations(s), messageContacts(s)]);
  const open = withId && studentId ? await thread(s, withId, studentId) : null;
  const unread = convos.reduce((a, c) => a + c.unread, 0);
  const pairs = contacts.map((c) => ({
    value: `${c.otherId}:${c.studentId}`,
    label: role === "PARENT" ? `${c.otherName} · ${c.context} (about ${first(c.studentName)})` : `${c.otherName}, parent of ${c.studentName} · ${c.context}`,
  }));

  return (
    <>
      <PageHeader eyebrow={role === "PARENT" ? "Parent portal" : "Families"} title="Messages"
        sub={`${unread} unread · ${role === "PARENT" ? "Write to your children's teachers." : "Write to parents of students in your classes."} Every conversation is about one child.`} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section className="card self-start p-3" aria-labelledby="h-convos">
          <div className="flex items-center justify-between px-2 pt-1"><h2 id="h-convos" className="text-base">Conversations</h2><Link className="btn btn-sm" href={`${home}/messages`}>New message</Link></div>
          {convos.length === 0 ? <p className="px-2 pb-2 text-sm text-muted">No conversations yet.</p> : (
            <ul className="flex flex-col">
              {convos.map((c) => {
                const on = open && c.otherId === open.other.id && c.studentId === open.student.id;
                return (
                  <li key={`${c.otherId}:${c.studentId}`}>
                    <Link href={`${home}/messages?with=${c.otherId}&student=${c.studentId}`} aria-current={on ? "page" : undefined}
                      className={`flex items-start gap-3 rounded-lg px-2 py-2.5 ${on ? "bg-brand-soft" : "hover:bg-surface-2"}`}>
                      <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-teal-soft font-display text-xs font-bold text-teal">{c.otherName.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2"><b className="truncate text-sm">{c.otherName}</b><span className="flex-none text-xs text-muted">{timeAgo(c.last.createdAt)}</span></span>
                        <span className="block text-xs font-bold text-muted">About {c.studentName}</span>
                        <span className="block truncate text-xs text-muted">{c.last.fromId === s.userId ? "You: " : ""}{c.last.body}</span>
                      </span>
                      {c.unread > 0 && <Chip tone="blue">{c.unread} new</Chip>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {open ? (
          <section className="card" aria-labelledby="h-thread">
            <div>
              <div className="eyebrow">About {open.student.name}</div>
              <h2 id="h-thread" className="text-lg">{role === "PARENT" ? `Message ${open.other.name}` : `Conversation with ${open.other.name}`}</h2>
            </div>
            {held && <p role="status" className="rounded-lg bg-warn-soft px-3 py-2 text-sm font-bold text-warn">Held for review: your message includes contact details or a link, so a school admin will check it before it is delivered.</p>}
            <ol className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto" aria-label="Messages">
              {open.messages.length === 0 && <li className="text-sm text-muted">No messages yet. Say hello below.</li>}
              {open.messages.map((m) => {
                const mine = m.fromId === s.userId;
                return (
                  <li key={m.id} className={`flex max-w-[85%] flex-col gap-1 rounded-2xl px-3.5 py-2 text-sm ${mine ? "self-end rounded-br-sm bg-brand-soft" : "self-start rounded-bl-sm bg-surface-2"}`}>
                    <span className="sr-only">{mine ? "You" : open.other.name}:</span>
                    <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</span>
                    <span className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                      <time dateTime={m.createdAt.toISOString()}>{fmtDate(m.createdAt)} {fmtTime(m.createdAt)}</time>
                      {mine && m.held && <Chip tone="warn">Held for review</Chip>}
                      {mine && !m.held && m.readAt && <span>Read</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
            <ComposeForm to={open.other.id} student={open.student.id} recipientName={open.other.name}
              templates={TEMPLATES[role](role === "PARENT" ? open.other.name : first(open.other.name), first(open.student.name))} />
          </section>
        ) : (
          <section className="card" aria-labelledby="h-new">
            <h2 id="h-new" className="text-lg">New message</h2>
            {pairs.length === 0
              ? <Empty title="No one to message yet" body={role === "PARENT" ? "Once the school verifies your link to a child, their teachers appear here." : "Parents appear here once the school verifies their link to a student in your classes."} />
              : <ComposeForm pairs={pairs} templates={TEMPLATES[role]("there", role === "PARENT" ? "my child" : "your child")} />}
          </section>
        )}
      </div>
    </>
  );
}
