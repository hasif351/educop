import { requireRole } from "@/lib/auth";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

export const metadata = { title: "Notifications" };

export default async function Notifications({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const s = await requireRole("SCHOOL_ADMIN");
  return <NotificationCenter s={s} filter={(await searchParams).filter} />;
}
