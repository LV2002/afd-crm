import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
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
  contactLists,
  contacts,
  cronRuns,
  leads,
  profiles,
  whatsappFlowRuns,
  whatsappFlowSteps,
  whatsappFlows,
  whatsappLabels,
} from "@/lib/db/schema";
import type { RuleConditions } from "@/lib/assignment/evaluate-conditions";
import { formatDateIST } from "@/lib/format/date";
import {
  describeStep,
  validateFlow,
  type FlowStep,
  type FlowTrigger,
} from "@/lib/whatsapp/flow-engine";
import { templateBody, templatePlaceholderCount } from "@/lib/integrations/whatsapp/templates";
import { loadTemperatureOptionsDirect } from "@/lib/leads/temperature-options-direct";
import { createClient } from "@/lib/supabase/server";

import { loadRuleOptions, type RuleOptions } from "@/app/(app)/settings/rules/load-options";

import { listTemplates } from "../../templates/actions";
import { FlowForm } from "../flow-form";
import { FlowControls } from "./flow-controls";
import { FlowMap } from "./flow-map";
import { TestSend } from "./test-send";
import { CATEGORY_LABELS, flowCostPerPerson, formatRate, formatTotal } from "@/lib/whatsapp/pricing";
import { loadRates } from "@/lib/whatsapp/spend";

import { guardPage } from "@/lib/errors/page-guard";
import { countNewListMembers } from "@/lib/whatsapp/flow-runner";
import { AutoStartPanel } from "./auto-start-panel";
import { StartForLists } from "./start-for-lists";
import { AddStep, ExistingStep, type StepEditorLists } from "./step-editor";

export const dynamic = "force-dynamic";

const RUN_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  running: "default",
  waiting: "secondary",
  completed: "secondary",
  stopped: "secondary",
  failed: "destructive",
};

// Pages that wait on Meta for the template list are given the longest the platform allows.
export const maxDuration = 60;

export default async function WhatsAppFlowPage(props: { params: Promise<{ id: string }> }) {
  return guardPage("page:whatsapp/flows/[id]", () => renderFlowPage(props));
}

async function renderFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;

  const { id } = await params;

  const [flow] = await db
    .select()
    .from(whatsappFlows)
    .where(and(eq(whatsappFlows.id, id), isNull(whatsappFlows.deletedAt)));
  if (!flow) notFound();

  const supabase = await createClient();
  const forDatabase = flow.audience === "contact";
  // A database automation has no temperature, counsellor or label steps and no
  // lead conditions, so none of that is read for it. Everything else is read at
  // the same time, not one thing after another.
  const none = <T,>(): Promise<T[]> => Promise.resolve([]);
  const [stepRows, temperatureOptions, centerRows, templateResult, runRows, ruleOptions, people, labelRows, rates, listRows] =
    await Promise.all([
      db
        .select()
        .from(whatsappFlowSteps)
        .where(eq(whatsappFlowSteps.flowId, id))
        .orderBy(asc(whatsappFlowSteps.position)),
      forDatabase ? none<Awaited<ReturnType<typeof loadTemperatureOptionsDirect>>[number]>() : loadTemperatureOptionsDirect(),
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
          studentName: sql<string>`coalesce(${leads.studentName}, ${contacts.name})`,
          leadId: leads.id,
          // What Meta last said about the message this run sent: delivered,
          // read, or the failure. "Sent" alone only means Meta accepted it.
          deliveryKind: sql<string | null>`(select e.kind from whatsapp_flow_run_events e where e.run_id = ${whatsappFlowRuns.id} and e.kind in ('delivered','read','delivery_failed') order by e.created_at desc limit 1)`,
          deliveryDetail: sql<string | null>`(select e.detail from whatsapp_flow_run_events e where e.run_id = ${whatsappFlowRuns.id} and e.kind in ('delivered','read','delivery_failed') order by e.created_at desc limit 1)`,
          sentCount: sql<number>`(select count(*)::int from whatsapp_flow_run_events e where e.run_id = ${whatsappFlowRuns.id} and e.kind = 'sent')`,
        })
        .from(whatsappFlowRuns)
        .leftJoin(leads, eq(leads.id, whatsappFlowRuns.leadId))
        .leftJoin(contacts, eq(contacts.id, whatsappFlowRuns.contactId))
        .where(eq(whatsappFlowRuns.flowId, id))
        .orderBy(desc(whatsappFlowRuns.startedAt))
        .limit(25),
      forDatabase ? Promise.resolve<RuleOptions>({ users: [], centers: [], optionsByField: {}, fields: [] }) : loadRuleOptions(supabase),
      forDatabase
        ? none<{ id: string; name: string }>()
        : db
            .select({ id: profiles.id, name: profiles.fullName })
            .from(profiles)
            .where(eq(profiles.isActive, true))
            .orderBy(asc(profiles.fullName)),
      forDatabase
        ? none<{ id: string; name: string }>()
        : db
            .select({ id: whatsappLabels.id, name: whatsappLabels.name })
            .from(whatsappLabels)
            .where(isNull(whatsappLabels.deletedAt))
            .orderBy(asc(whatsappLabels.name)),
      loadRates(),
      forDatabase
        ? db.execute<{ id: string; name: string; agreed: boolean }>(sql`
            select id, name, use_for_whatsapp as agreed from contact_lists where archived_at is null order by name
          `)
        : none<{ id: string; name: string; agreed: boolean }>(),
    ]);

  // For an automation that starts when somebody joins a database: what it is
  // watching and doing, so "is it actually working?" has an answer on screen.
  let autoStart: React.ComponentProps<typeof AutoStartPanel> | null = null;
  if (forDatabase && flow.triggerType === "list_joined") {
    const config = (flow.triggerConfig ?? {}) as Record<string, unknown>;
    const watchedIds = Array.isArray(config.listIds) ? (config.listIds as string[]) : [];
    const [nameRows, counts, lastCheck, waiting] = await Promise.all([
      watchedIds.length > 0
        ? db.select({ id: contactLists.id, name: contactLists.name }).from(contactLists).where(inArray(contactLists.id, watchedIds))
        : Promise.resolve([] as Array<{ id: string; name: string }>),
      db
        .select({ started: sql<number>`count(*)::int`, last: sql<Date | null>`max(${whatsappFlowRuns.startedAt})` })
        .from(whatsappFlowRuns)
        .where(eq(whatsappFlowRuns.flowId, flow.id)),
      db.select({ at: cronRuns.finishedAt }).from(cronRuns).where(eq(cronRuns.jobKey, "frequent")).orderBy(desc(cronRuns.finishedAt)).limit(1),
      flow.isActive ? countNewListMembers(flow.id, flow.triggerConfig) : Promise.resolve(0),
    ]);
    const stamp = (value: Date | string | null | undefined) => (value ? formatDateIST(value instanceof Date ? value.toISOString() : value, "d MMM, h:mm a") : null);
    autoStart = {
      flowId: flow.id,
      isActive: flow.isActive,
      lists: watchedIds.map((id) => nameRows.find((n) => n.id === id)?.name ?? "a deleted list"),
      watchingSince: stamp(typeof config.from === "string" ? config.from : null),
      started: counts[0]?.started ?? 0,
      lastStartedAt: stamp(counts[0]?.last ?? null),
      waiting,
      lastCheckAt: stamp(lastCheck[0]?.at ?? null),
    };
  }

  const steps: FlowStep[] = stepRows.map((row) => ({
    id: row.id,
    position: row.position,
    kind: row.kind,
    config: row.config ?? {},
  }));
  const issues = validateFlow(steps, flow.triggerType);

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

  // What one person costs to take through this automation, from the
  // templates its steps send and the rates under WhatsApp → Spend.
  const categoryByTemplate = new Map(
    templateResult.status === "ok" ? templateResult.templates.map((t) => [t.name, t.category] as const) : [],
  );
  const perPerson = flowCostPerPerson(stepRows, categoryByTemplate, rates);

  const lists: StepEditorLists = {
    templates,
    // What an automation may SET. Took admission needs a confirmed
    // admission and a closing outcome that asks why needs a reason, and a
    // step can supply neither — so they are not offered, rather than
    // offered and then refused by the database at 3am.
    statuses: temperatureOptions
      .filter(
        (option) =>
          option.isActive &&
          option.kind !== "won" &&
          !(option.kind === "lost" && option.requiresReason),
      )
      .map((option) => ({ value: option.value, label: option.label })),
    positions: steps.map((step) => step.position),
    audience: flow.audience,
    counsellors: people.map((p) => ({ value: p.id, label: p.name })),
    labels: labelRows.map((l) => ({ value: l.id, label: l.name })),
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

      <div className="max-w-2xl rounded-md border bg-muted/40 p-3 text-sm">
        <p>
          Cost per person:{" "}
          <span className="font-semibold">{perPerson.parts.length === 0 ? "₹0.00" : `up to ${formatTotal(perPerson.total)}`}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {perPerson.parts.length === 0
            ? "No template messages in this automation, so nothing is billed (replies inside an open 24-hour window are free)."
            : `${perPerson.parts
                .map((p) => `${p.template}: ${formatRate(p.rate)} (${CATEGORY_LABELS[p.category] ?? p.category})`)
                .join(" + ")}. At most this, since not everybody reaches every step, and free inside an open reply window. Multiply by the number of people to estimate a start.`}
        </p>
      </div>

      <FlowControls flowId={flow.id} isActive={flow.isActive} liveRuns={liveRuns.length} />

      {autoStart && <AutoStartPanel {...autoStart} />}

      {forDatabase && (
        <StartForLists
          flowId={flow.id}
          isActive={flow.isActive}
          lists={[...listRows].map((l) => ({ id: l.id, name: l.name, agreed: Boolean(l.agreed) }))}
        />
      )}

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

      <FlowMap steps={steps} />

      {steps.length > 0 && <TestSend flowId={flow.id} />}

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
            temperature: String(triggerConfig.temperature ?? ""),
            keywords: Array.isArray(triggerConfig.keywords)
              ? (triggerConfig.keywords as string[]).join(", ")
              : "",
            listIds: Array.isArray(triggerConfig.listIds) ? (triggerConfig.listIds as string[]) : [],
            centerId: flow.centerId ?? "",
            audience: flow.audience,
            appliesTo: (flow.appliesTo as RuleConditions | null)?.all ?? [],
          }}
          statuses={temperatureOptions
            .filter((option) => option.isActive)
            .map((option) => ({ value: option.value, label: option.label }))}
            centers={centerRows}
          fields={ruleOptions.fields}
          optionsByField={ruleOptions.optionsByField}
          lists={[...listRows].filter((l) => Boolean(l.agreed)).map((l) => ({ id: l.id, name: l.name }))}
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
                <TableHead>{forDatabase ? "Contact" : "Lead"}</TableHead>
                <TableHead>Where they are</TableHead>
                <TableHead>Delivery</TableHead>
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
                  <TableCell className="max-w-xs text-xs">
                    {run.deliveryKind === "delivery_failed" ? (
                      <span className="text-destructive">Not delivered. {run.deliveryDetail}</span>
                    ) : run.deliveryKind === "read" ? (
                      "Read"
                    ) : run.deliveryKind === "delivered" ? (
                      "Delivered"
                    ) : run.sentCount > 0 ? (
                      <span className="text-muted-foreground">
                        Sent to WhatsApp, no delivery report yet. If this stays blank, the number or the
                        account is not receiving reports from Meta.
                      </span>
                    ) : (
                      "—"
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
