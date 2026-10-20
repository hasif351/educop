import { requireRole } from "@/lib/auth";
import { MessagesPage } from "@/components/messages/MessagesPage";

export const metadata = { title: "Messages" };

export default async function Messages({ searchParams }: { searchParams: Promise<{ with?: string; student?: string; held?: string }> }) {
  const s = await requireRole("TEACHER");
  const q = await searchParams;
  return <MessagesPage s={s} withId={q.with} studentId={q.student} held={q.held === "1"} />;
}
