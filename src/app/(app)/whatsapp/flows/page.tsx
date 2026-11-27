import Link from "next/link";
import { asc, inArray, isNull, sql } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RuleConditions } from "@/lib/assignment/evaluate-conditions";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { contactLists, whatsappFlowRuns, whatsappFlowSteps, whatsappFlows } from "@/lib/db/schema";
import { describeConditions } from "@/lib/rules/describe-rule";
import { createClient } from "@/lib/supabase/server";
import { STARTER_FLOWS } from "@/lib/whatsapp/starter-flows";

import { guardPage } from "@/lib/errors/page-guard";

import { createStarterFlow } from "./actions";

import { loadRuleOptions, ruleLabelLookup } from "@/app/(app)/settings/rules/load-options";

export const dynamic = "force-dynamic";

const TRIGGER_LABELS: Record<string, string> = {
  lead_created: "A new lead arrives",
  temperature_entered: "A lead's temperature changes",
  // Tags were removed. A flow that still has this trigger never starts; it is
  // paused, and its owner is told to choose another trigger.
  tag_added: "A tag is put on a lead (removed — pick another trigger)",
  inbound_keyword: "Somebody messages us a word",
  list_joined: "Somebody is added to a database",
  manual: "Started by hand",
};

// Pages that wait on Meta for the template list are given the longest the platform allows.
export const maxDuration = 60;

export default async function WhatsAppFlowsPage() {
  return guardPage("page:whatsapp/flows", renderFlowsPage);
}

async function renderFlowsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;

  const supabase = await createClient();

  const flows = await db
    .select({
      id: whatsappFlows.id,
      name: whatsappFlows.name,
      description: whatsappFlows.description,
      triggerType: whatsappFlows.triggerType,
      audience: whatsappFlows.audience,
      appliesTo: whatsappFlows.appliesTo,
      isActive: whatsappFlows.isActive,
      steps: sql<number>`(select count(*) from ${whatsappFlowSteps} where ${whatsappFlowSteps.flowId} = ${whatsappFlows.id})`,
      triggerConfig: whatsappFlows.triggerConfig,
      live: sql<number>`(select count(*) from ${whatsappFlowRuns} where ${whatsappFlowRuns.flowId} = ${whatsappFlows.id} and status in ('running','waiting'))`,
      started7: sql<number>`(select count(*) from ${whatsappFlowRuns} where ${whatsappFlowRuns.flowId} = ${whatsappFlows.id} and started_at > now() - interval '7 days')`,
    })
    .from(whatsappFlows)
    .where(isNull(whatsappFlows.deletedAt))
    .orderBy(asc(whatsappFlows.name));

  // Names of the databases the "when somebody is added" automations watch.
  const watchedIds = [
    ...new Set(
      flows.flatMap((flow) =>
        flow.triggerType === "list_joined" && Array.isArray(flow.triggerConfig?.listIds) ? (flow.triggerConfig.listIds as string[]) : [],
      ),
    ),
  ];
  const watchedNames = new Map<string, string>();
  if (watchedIds.length > 0) {
    const rows = await db.select({ id: contactLists.id, name: contactLists.name }).from(contactLists).where(inArray(contactLists.id, watchedIds));
    for (const row of rows) watchedNames.set(row.id, row.name);
  }

  // The words for conditions ("Only: centre is Kochi") are only needed when an
  // automation actually has conditions.
  const label = ruleLabelLookup(
    flows.some((flow) => flow.appliesTo)
      ? await loadRuleOptions(supabase)
      : { users: [], centers: [], optionsByField: {}, fields: [] },
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          A numbered list of steps a lead walks down: send a message, ask a question, wait for their
          reply and go somewhere different depending on what they say. Messages you type yourself
          only reach people who wrote to you in the last 24 hours; later in a sequence, use an
          approved template. Nobody who has opted out or is marked do-not-contact is ever messaged.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/whatsapp/flows/report">Sent &amp; cost report</Link>
          </Button>
          <Button asChild>
            <Link href="/whatsapp/flows/new">New automation</Link>
          </Button>
        </div>
      </div>

      <section className="flex flex-col gap-2 rounded-lg border border-dashed p-4">
        <h3 className="text-sm font-semibold">Start from an example</h3>
        <div className="flex flex-wrap gap-3">
          {STARTER_FLOWS.map((starter) => (
            <form key={starter.key} action={createStarterFlow} className="flex max-w-sm flex-col gap-1">
              <input type="hidden" name="key" value={starter.key} />
              <p className="text-sm font-medium">{starter.name}</p>
              <p className="text-xs text-muted-foreground">{starter.description}</p>
              <Button type="submit" size="sm" variant="outline" className="w-fit">Use this</Button>
            </form>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Copied in as a switched-off automation you can edit before turning on.</p>
      </section>

      {flows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing set up yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Starts when</TableHead>
              <TableHead>Steps</TableHead>
              <TableHead>People in it</TableHead>
              <TableHead>Started (7 days)</TableHead>
              <TableHead>On</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flows.map((flow) => (
              <TableRow key={flow.id}>
                <TableCell className="font-medium">
                  <Link href={`/whatsapp/flows/${flow.id}`} className="underline">
                    {flow.name}
                  </Link>
                  {flow.description && (
                    <p className="text-xs font-normal text-muted-foreground">{flow.description}</p>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {flow.audience === "contact"
                    ? flow.triggerType === "list_joined"
                      ? `Starts when somebody is added to: ${
                          ((flow.triggerConfig?.listIds as string[] | undefined) ?? []).map((id) => watchedNames.get(id) ?? "a deleted list").join(", ") || "no list chosen"
                        }`
                      : "Started by hand for database lists"
                    : (TRIGGER_LABELS[flow.triggerType] ?? flow.triggerType)}
                  {/* An automation narrowed to a slice of leads looked
                      identical here to one that reaches everybody, which
                      is the difference between 200 messages and 12. */}
                  {flow.appliesTo && (
                    <p className="text-xs">
                      Only: {describeConditions(flow.appliesTo as RuleConditions, label)}
                    </p>
                  )}
                </TableCell>
                <TableCell>{Number(flow.steps)}</TableCell>
                <TableCell>{Number(flow.live)}</TableCell>
                <TableCell>{Number(flow.started7)}</TableCell>
                <TableCell>
                  <Badge variant={flow.isActive ? "default" : "secondary"}>
                    {flow.isActive ? "On" : "Off"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
