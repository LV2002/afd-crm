import { AccessDenied } from "@/components/layout/access-denied";
import { SettingsNav } from "@/components/layout/settings-nav";
import { getCurrentUser } from "@/lib/auth/session";
import { settingsNavFor } from "@/lib/settings/nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const items = user ? settingsNavFor(user) : [];

  if (!user || items.length === 0) {
    return <AccessDenied />;
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="lg:w-56 lg:shrink-0">
        <SettingsNav items={items} />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
