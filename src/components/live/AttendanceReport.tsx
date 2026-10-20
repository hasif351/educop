import { db } from "@/lib/db";
import { minutesAttended, tallyPoll } from "@/lib/live-utils";
import { Chip, fmtTime } from "@/components/ui";

/** After a class: who joined, for how long, and poll results. Observable events only. */
export async function AttendanceReport({ sessionId, classId }: { sessionId: string; classId: string }) {
  const [roster, attendance, polls, chatCount, heldCount] = await Promise.all([
    db.enrollment.findMany({ where: { classId }, select: { student: { select: { id: true, name: true } } }, orderBy: { student: { name: "asc" } } }),
    db.liveAttendance.findMany({ where: { sessionId } }),
    db.livePoll.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } }),
    db.liveChat.count({ where: { sessionId, held: false } }),
    db.liveChat.count({ where: { sessionId, held: true } }),
  ]);
  const present = attendance.filter((a) => roster.some((r) => r.student.id === a.userId));
  const responses = polls.reduce((n, p) => n + tallyPoll(p.options, p.votes).total, 0);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card" aria-labelledby="h-att">
        <h2 id="h-att" className="text-lg">Attendance &amp; participation</h2>
        <dl className="grid grid-cols-3 gap-3">
          {[["Present", `${present.length}/${roster.length}`], ["Poll responses", String(responses)], ["Chat messages", String(chatCount)]].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line p-3"><dt className="text-xs text-muted">{k}</dt><dd className="tnum font-display text-xl font-semibold">{v}</dd></div>
          ))}
        </dl>
        <p className="text-xs text-muted">Counts of observable events only. Quiet students may be learning well.{heldCount ? ` ${heldCount} chat message${heldCount === 1 ? " was" : "s were"} held and not shown.` : ""}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-2 pr-2">Student</th><th className="p-2">Joined</th><th className="p-2">Last seen</th><th className="p-2">Minutes</th><th className="p-2">Status</th></tr></thead>
            <tbody>
              {roster.map(({ student }) => {
                const a = attendance.find((x) => x.userId === student.id);
                return (
                  <tr key={student.id} className="border-b border-line last:border-0">
                    <th scope="row" className="py-2 pr-2 text-left font-normal">{student.name}</th>
                    <td className="tnum p-2">{a ? fmtTime(a.joinedAt) : "–"}</td>
                    <td className="tnum p-2">{a ? fmtTime(a.lastSeenAt) : "–"}</td>
                    <td className="tnum p-2">{a ? minutesAttended(a.joinedAt, a.lastSeenAt) : "–"}</td>
                    <td className="p-2">{a ? <Chip tone="good">Present</Chip> : <Chip tone="warn">Absent</Chip>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card self-start" aria-labelledby="h-polls">
        <h2 id="h-polls" className="text-lg">Poll results</h2>
        {polls.length === 0 ? <p className="text-sm text-muted">No polls were run.</p> : polls.map((p) => {
          const { counts, total } = tallyPoll(p.options, p.votes);
          return (
            <div key={p.id} className="flex flex-col gap-1.5 border-t border-line pt-3 text-sm first:border-0 first:pt-0">
              <b>{p.question}</b>
              {p.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2"><span className="w-24 truncate">{o}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true"><div className="h-full rounded-full bg-brand" style={{ width: `${total ? (counts[i] / total) * 100 : 0}%` }} /></div>
                  <span className="tnum w-6 text-right">{counts[i]}</span></div>
              ))}
              <span className="text-xs text-muted">{total} {total === 1 ? "response" : "responses"}</span>
            </div>
          );
        })}
      </section>
    </div>
  );
}
