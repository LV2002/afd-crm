import { AccessDenied } from "@/components/layout/access-denied";
import { PageStub } from "@/components/layout/page-stub";
import { can, getCurrentUser } from "@/lib/auth/session";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "report.read")) return <AccessDenied />;

  return (
    <PageStub
      title="Reports"
      phase="Phase 2"
      description="Prebuilt dashboards: leads by source, funnel, counsellor scorecard, centre performance."
    />
  );
}
