import { AccessDenied } from "@/components/layout/access-denied";
import { PageStub } from "@/components/layout/page-stub";
import { can, getCurrentUser } from "@/lib/auth/session";

export default async function PipelinePage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "lead.read")) return <AccessDenied />;

  return (
    <PageStub
      title="Pipeline"
      phase="Phase 1"
      description="Kanban view over pipeline_stages with drag-to-stage and a lost-reason modal."
    />
  );
}
