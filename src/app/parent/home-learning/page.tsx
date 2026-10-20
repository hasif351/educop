import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { homeLearningInputs, parentChildList } from "@/lib/data-parent";
import { doneKeys, homeActivities } from "@/lib/home-learning";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { ChildSwitcher } from "../ChildSwitcher";
import { DoneToggle } from "./DoneToggle";

export const metadata = { title: "Home learning" };

export default async function HomeLearning({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const s = await requireRole("PARENT");
  const kids = await parentChildList(s);
  const header = <PageHeader eyebrow="Parent portal" title="Home learning" sub="Short, low-pressure activities that match what your child is learning at school this week." />;
  if (kids.length === 0) return <>{header}<Empty title="No linked children yet" body="Your school verifies parent–child links. Contact the school office if a child is missing." /></>;

  const wanted = (await searchParams).child;
  if (wanted && !kids.some((k) => k.id === wanted)) notFound();
  const childId = wanted ?? kids[0].id;
  const [{ child, recs, lessons }, me] = await Promise.all([
    homeLearningInputs(s, childId),
    db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { prefs: true } }),
  ]);
  const done = doneKeys(me.prefs);
  const activities = homeActivities(recs, lessons);
  const doneCount = activities.filter((a) => done[`${childId}|${a.key}`]).length;
  const name = child.name.split(" ")[0];

  return (
    <>
      {header}
      {kids.length > 1 && <ChildSwitcher kids={kids} selected={childId} base="/parent/home-learning" />}
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg">This week with {name}</h2>
          {activities.length > 0 && <Chip tone={doneCount ? "good" : "plain"}>{doneCount} of {activities.length} done</Chip>}
        </div>
        <p className="text-sm text-muted">Pick one or two. Five calm minutes together helps more than a long session. Ticking &ldquo;We did this&rdquo; is just for you: it isn&apos;t graded or shared.</p>
        {activities.length === 0 ? <Empty title="Nothing this week yet" body="Activities appear once this week's lessons are published or the teacher adds a suggestion." /> : (
          <ul className="grid gap-3 md:grid-cols-2">
            {activities.map((a) => (
              <li key={a.key} className="flex flex-col gap-2 rounded-lg border border-line p-4 text-sm">
                <div className="flex flex-wrap gap-2"><Chip tone="teal">{a.minutes} min</Chip><Chip>{a.source}</Chip></div>
                <h3 className="text-base">{a.title}</h3>
                <p className="text-muted">{a.body}</p>
                <DoneToggle childId={childId} activityKey={a.key} done={Boolean(done[`${childId}|${a.key}`])} title={a.title} />
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">Template ideas based on the class lessons and teacher-approved suggestions.</p>
      </section>
    </>
  );
}
