import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { whatsappBroadcastRecipients, whatsappFlowRunEvents, whatsappFlowRuns, whatsappRates, whatsappSpend } from "@/lib/db/schema";

import { normaliseCategory, rateFor, type RateMap } from "./pricing";

export async function loadRates(): Promise<RateMap> {
  const rows = await db.select().from(whatsappRates);
  return Object.fromEntries(rows.map((r) => [r.category, r.rateTenThousandths]));
}

/**
 * Records what Meta says one message was billed as, from its delivery report
 * (`statuses[].pricing`). One row per message; a later report for the same
 * message does not double it. The broadcast or automation that sent it is
 * found from the records this CRM already keeps, so spend can be shown per
 * campaign without any extra bookkeeping at send time.
 */
export async function recordMessageSpend(
  waMessageId: string,
  pricing: { billable?: boolean; category?: string } | undefined,
  rates?: RateMap,
): Promise<void> {
  if (!pricing || pricing.billable === undefined) return;
  const category = normaliseCategory(pricing.category);
  const rateMap = rates ?? (await loadRates());
  const amount = pricing.billable ? rateFor(rateMap, category) : 0;

  const [recipient] = await db
    .select({ broadcastId: whatsappBroadcastRecipients.broadcastId })
    .from(whatsappBroadcastRecipients)
    .where(eq(whatsappBroadcastRecipients.waMessageId, waMessageId))
    .limit(1);

  let flowId: string | null = null;
  if (!recipient) {
    const [event] = await db
      .select({ flowId: whatsappFlowRuns.flowId })
      .from(whatsappFlowRunEvents)
      .innerJoin(whatsappFlowRuns, eq(whatsappFlowRuns.id, whatsappFlowRunEvents.runId))
      .where(sql`${whatsappFlowRunEvents.kind} = 'sent' and ${whatsappFlowRunEvents.detail} like ${"%" + waMessageId + "%"}`)
      .limit(1);
    flowId = event?.flowId ?? null;
  }

  await db
    .insert(whatsappSpend)
    .values({
      waMessageId,
      category,
      billable: pricing.billable,
      amountTenThousandths: amount,
      broadcastId: recipient?.broadcastId ?? null,
      flowId,
    })
    .onConflictDoNothing({ target: whatsappSpend.waMessageId });
}
