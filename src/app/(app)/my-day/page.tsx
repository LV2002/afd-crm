import { AccessDenied } from "@/components/layout/access-denied";
import { PageStub } from "@/components/layout/page-stub";
import { can } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/session";

export default async function MyDayPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.read")) return <AccessDenied />;

  return (
    <PageStub
      title="My Day"
      phase="Phase 2"
      description="Overdue, due-today, new assignments and at-risk leads — the default work queue for counsellors."
    />
  );
}
