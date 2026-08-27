import { AccessDenied } from "@/components/layout/access-denied";
import { PageStub } from "@/components/layout/page-stub";
import { can, getCurrentUser } from "@/lib/auth/session";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "settings.manage")) return <AccessDenied />;

  return (
    <PageStub
      title="Settings"
      phase="Session 2"
      description="Organisation, terminology, centres, users, roles & permissions, pipeline stages, dropdowns and custom fields."
    />
  );
}
