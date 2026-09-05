import Link from "next/link";
import { asc, isNull, sql } from "drizzle-orm";

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
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { whatsappFlowRuns, whatsappFlowSteps, whatsappFlows } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const TRIGGER_LABELS: Record<string, string> = {
  lead_created: "A new lead arrives",
  stage_entered: "A lead moves into a stage",
  tag_added: "A tag is put on a lead",
  inbound_keyword: "Somebody messages us a word",
  manual: "Started by hand",
};

export default async function WhatsAppFlowsPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;

  const flows = await db
    .select({
      id: whatsappFlows.id,
      name: whatsappFlows.name,
      description: whatsappFlows.description,
      triggerType: whatsappFlows.triggerType,
      isActive: whatsappFlows.isActive,
      steps: sql<number>`(select count(*) from ${whatsappFlowSteps} where ${whatsappFlowSteps.flowId} = ${whatsappFlows.id})`,
      live: sql<number>`(select count(*) from ${whatsappFlowRuns} where ${whatsappFlowRuns.flowId} = ${whatsappFlows.id} and status in ('running','waiting'))`,
    })
    .from(whatsappFlows)
    .where(isNull(whatsappFlows.deletedAt))
    .orderBy(asc(whatsappFlows.name));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          A numbered list of steps a lead walks down: send a template, wait, send another — and wait
          for their reply to decide where they go next. Everything an automation sends is an
          approved template, and nobody who has opted out or is marked do-not-contact is ever
          messaged by one.
        </p>
        <Button asChild>
          <Link href="/whatsapp/flows/new">New automation</Link>
        </Button>
      </div>

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
                  {TRIGGER_LABELS[flow.triggerType] ?? flow.triggerType}
                </TableCell>
                <TableCell>{Number(flow.steps)}</TableCell>
                <TableCell>{Number(flow.live)}</TableCell>
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
