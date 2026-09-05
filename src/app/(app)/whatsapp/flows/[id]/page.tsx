import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import {
  centers,
  leads,
  pipelineStages,
  tags,
  whatsappFlowRuns,
  whatsappFlowSteps,
  whatsappFlows,
} from "@/lib/db/schema";
import { formatDateIST } from "@/lib/format/date";
import {
  describeStep,
  validateFlow,
  type FlowStep,
  type FlowTrigger,
} from "@/lib/whatsapp/flow-engine";
import { templateBody, templatePlaceholderCount } from "@/lib/integrations/whatsapp/templates";

import { listTemplates } from "../../templates/actions";
import { FlowForm } from "../flow-form";
import { FlowControls } from "./flow-controls";
import { AddStep, ExistingStep, type StepEditorLists } from "./step-editor";

export const dynamic = "force-dynamic";

const RUN_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  running: "default",
  waiting: "secondary",
  completed: "secondary",
  stopped: "secondary",
  failed: "destructive",
};

export default async function WhatsAppFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;

  const { id } = await params;

  const [flow] = await db
    .select()
    .from(whatsappFlows)
    .where(and(eq(whatsappFlows.id, id), isNull(whatsappFlows.deletedAt)));
  if (!flow) notFound();

  const [stepRows, stageRows, tagRows, centerRows, templateResult, runRows] = await Promise.all([
    db
      .select()
      .from(whatsappFlowSteps)
      .where(eq(whatsappFlowSteps.flowId, id))
      .orderBy(asc(whatsappFlowSteps.position)),
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
    listTemplates(),
    db
      .select({
        id: whatsappFlowRuns.id,
        status: whatsappFlowRuns.status,
        stopReason: whatsappFlowRuns.stopReason,
        startedAt: whatsappFlowRuns.startedAt,
        wakeAt: whatsappFlowRuns.wakeAt,
        studentName: leads.studentName,
        leadId: leads.id,
      })
      .from(whatsappFlowRuns)
      .innerJoin(leads, eq(leads.id, whatsappFlowRuns.leadId))
      .where(eq(whatsappFlowRuns.flowId, id))
      .orderBy(desc(whatsappFlowRuns.startedAt))
      .limit(25),
  ]);

  const steps: FlowStep[] = stepRows.map((row) => ({
    id: row.id,
    position: row.position,
    kind: row.kind,
    config: row.config ?? {},
  }));
  const issues = validateFlow(steps);

  // Only approved templates, for the same reason the broadcast composer
  // only offers approved ones: anything else is a send that fails at
  // Meta's door with nobody the wiser.
  const templates =
    templateResult.status === "ok"
      ? templateResult.templates
          .filter((template) => template.status === "APPROVED")
          .map((template) => ({
            name: template.name,
            language: template.language,
            body: templateBody(template),
            placeholders: templatePlaceholderCount(template),
          }))
      : [];

  const lists: StepEditorLists = {
    templates,
    tags: tagRows,
    stages: stageRows,
    positions: steps.map((step) => step.position),
  };

  const liveRuns = runRows.filter((run) => run.status === "running" || run.status === "waiting");

  const triggerConfig = (flow.triggerConfig ?? {}) as Record<string, unknown>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{flow.name}</h2>
          {flow.description && (
            <p className="max-w-2xl text-sm text-muted-foreground">{flow.description}</p>
          )}
        </div>
        <Badge variant={flow.isActive ? "default" : "secondary"}>
          {flow.isActive ? "On" : "Off"}
        </Badge>
      </div>

      <FlowControls flowId={flow.id} isActive={flow.isActive} liveRuns={liveRuns.length} />

      {issues.length > 0 && (
        <div className="rounded-lg border border-dashed p-4 text-sm">
          <p className="font-medium">Before this can be switched on:</p>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {issues.map((issue, index) => (
              <li key={index}>
                {issue.position ? `Step ${issue.position}: ` : ""}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">The steps</h3>
        {steps.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing yet. A first step is usually a message.
          </p>
        )}
        {stepRows.map((row) => (
          <ExistingStep
            key={row.id}
            flowId={flow.id}
            stepId={row.id}
            position={row.position}
            kind={row.kind}
            initialConfig={row.config ?? {}}
            lists={lists}
          />
        ))}
        <AddStep flowId={flow.id} lists={lists} />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Settings</h3>
        <FlowForm
          values={{
            id: flow.id,
            name: flow.name,
            description: flow.description ?? "",
            triggerType: flow.triggerType as FlowTrigger,
            stageId: String(triggerConfig.stageId ?? ""),
            tagId: String(triggerConfig.tagId ?? ""),
            keywords: Array.isArray(triggerConfig.keywords)
              ? (triggerConfig.keywords as string[]).join(", ")
              : "",
            centerId: flow.centerId ?? "",
          }}
          stages={stageRows}
          tags={tagRows}
          centers={centerRows}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Who has been through it</h3>
        {runRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Where they are</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Next move</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runRows.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-medium">{run.studentName}</TableCell>
                  <TableCell>
                    <Badge variant={RUN_STATUS_VARIANT[run.status] ?? "secondary"}>
                      {run.status}
                    </Badge>
                    {run.stopReason && (
                      <span className="ml-2 text-xs text-muted-foreground">{run.stopReason}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateIST(run.startedAt, "d MMM yyyy, h:mm a")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {run.wakeAt ? formatDateIST(run.wakeAt, "d MMM yyyy, h:mm a") : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        In order:{" "}
        {steps.map((step) => `${step.position}. ${describeStep(step)}`).join(" → ") || "—"}
      </p>
    </div>
  );
}
