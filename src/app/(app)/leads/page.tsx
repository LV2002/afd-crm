import { AccessDenied } from "@/components/layout/access-denied";
import { PageStub } from "@/components/layout/page-stub";
import { can, getCurrentUser } from "@/lib/auth/session";

export default async function LeadsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.read")) return <AccessDenied />;

  return (
    <PageStub
      title="Leads"
      phase="Phase 1"
      description="The lead list with filters, saved views, masked phone numbers and audited CSV export."
    />
  );
}
