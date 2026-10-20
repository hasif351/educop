import { requireRole } from "@/lib/auth";
import { SettingsPage } from "@/components/settings/SettingsPage";

export const metadata = { title: "Settings & privacy" };

export default async function Settings({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const s = await requireRole("TEACHER");
  return <SettingsPage s={s} tab={(await searchParams).tab} />;
}
