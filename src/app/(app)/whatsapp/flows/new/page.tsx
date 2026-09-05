import { asc, eq, isNull } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { centers, pipelineStages, tags } from "@/lib/db/schema";

import { FlowForm } from "../flow-form";

export const dynamic = "force-dynamic";

export default async function NewWhatsAppFlowPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;

  const [stageRows, tagRows, centerRows] = await Promise.all([
    db
      .select({ id: pipelineStages.id, name: pipelineStages.name })
      .from(pipelineStages)
      .where(isNull(pipelineStages.deletedAt))
      .orderBy(asc(pipelineStages.sortOrder)),
    db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(isNull(tags.deletedAt))
      .orderBy(asc(tags.name)),
    db
      .select({ id: centers.id, name: centers.name })
      .from(centers)
      .where(eq(centers.isActive, true))
      .orderBy(asc(centers.name)),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">New automation</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Name it and say what starts it. The steps come next — and it stays switched off until you
          turn it on, so nothing goes out while you are still writing it.
        </p>
      </div>

      <FlowForm
        values={{
          name: "",
          description: "",
          triggerType: "stage_entered",
          stageId: "",
          tagId: "",
          keywords: "",
          centerId: "",
        }}
        stages={stageRows}
        tags={tagRows}
        centers={centerRows}
      />
    </div>
  );
}
