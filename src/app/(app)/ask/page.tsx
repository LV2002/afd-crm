import { AccessDenied } from "@/components/layout/access-denied";
import { PageStub } from "@/components/layout/page-stub";
import { can, getCurrentUser } from "@/lib/auth/session";

export default async function AskPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "ai.query")) return <AccessDenied />;

  return (
    <PageStub
      title="Ask AI"
      phase="Phase 5"
      description="An AI analyst limited to a fixed set of parameterised, permission-scoped tools — never raw SQL."
    />
  );
}
