import { requireRole } from "@/lib/auth";
import { buddyData } from "@/lib/data-student-modules";
import { aiAvailable } from "@/lib/ai";
import { NOVA_DAILY_LIMIT } from "@/lib/nova";
import { PageHeader } from "@/components/ui";
import { NovaChat } from "./NovaChat";

export const metadata = { title: "Study buddy" };

export default async function BuddyPage() {
  const s = await requireRole("STUDENT");
  const d = await buddyData(s);

  return (
    <>
      <PageHeader eyebrow="Study buddy" title="Nova · AI study buddy"
        sub="Nova gives hints first so you can figure things out yourself. It helps with school topics, not with personal problems." />
      {!d.access.allowed ? (
        <section className="card max-w-2xl" role="status">
          <h2 className="text-lg">Nova isn&apos;t turned on for you</h2>
          <p>{d.access.reason === "school"
            ? "Your school hasn't switched on the AI study buddy yet."
            : "Your parent or carer has chosen not to turn on the AI study buddy for now."} That&apos;s okay! Your teacher is always happy to help, and your lessons have hints and worked examples too.</p>
          {d.access.reason === "consent" && <p className="text-sm text-muted">If you&apos;d like to use it, talk to your parent or carer. They can change this in their settings.</p>}
        </section>
      ) : (
        <NovaChat initial={d.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, flagged: m.flagged, model: m.model }))}
          remaining={d.remaining} limit={NOVA_DAILY_LIMIT} online={aiAvailable()} />
      )}
    </>
  );
}
