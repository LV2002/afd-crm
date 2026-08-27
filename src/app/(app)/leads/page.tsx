import { AccessDenied } from "@/components/layout/access-denied";
import { PageStub } from "@/components/layout/page-stub";
import { can, getCurrentUser } from "@/lib/auth/session";
import { formatTerm } from "@/lib/terminology/terms";
import { getTerminologyMap } from "@/lib/terminology/get-terminology";

export default async function LeadsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.read")) return <AccessDenied />;

  const terms = await getTerminologyMap();
  const leadPlural = formatTerm(terms, "lead", "plural");

  return (
    <PageStub
      title={leadPlural}
      phase="Phase 1"
      description={`The ${leadPlural.toLowerCase()} list with filters, saved views, masked phone numbers and audited CSV export.`}
    />
  );
}
