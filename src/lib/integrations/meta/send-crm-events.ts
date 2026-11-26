import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { enquiries, leads, metaCapiEvents, temperatureHistory } from "@/lib/db/schema";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { normalizeEmailForHash, normalizePhoneForHash, sha256Hex } from "@/lib/integrations/hash-pii";

import { sendCapiEvents, type CapiEvent } from "./conversions-client";

/**
 * Tells Meta how a lead from a Meta lead ad progressed — Contacted, Hot,
 * Took Admission — so its CRM funnel (Conversion Leads) can optimise for the
 * outcome that matters instead of just a form fill.
 *
 * Source of truth is `temperature_history`, written by a trigger on every
 * status change, so no write path has to remember to report. Each change is
 * sent once (`meta_capi_events`); a failure is retried next run until the
 * change is too old for Meta to accept.
 *
 * Only leads that came from a Meta lead ad have a Meta lead id to send. Others
 * (walk-ins, Google, WhatsApp) are skipped.
 */

/** Meta accepts CRM events up to seven days after they happened. */
export const CAPI_MAX_AGE_DAYS = 7;
const BATCH = 100;

/**
 * The name Meta sees for a status: the status label in Title Case ("Took
 * admission" → "Took Admission"). These are the names to pick in the Events
 * Manager funnel, so they are the labels the team already uses.
 */
export function capiEventName(label: string): string {
  return label
    .trim()
    .split(/\s+/)
    .map((word) => (word.length > 1 && word === word.toUpperCase() ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

export interface CapiRunResult {
  sent: number;
  failed: number;
  skipped: number;
  reason?: string;
}

export async function sendCrmEventsToMeta(now: Date = new Date()): Promise<CapiRunResult> {
  const empty = { sent: 0, failed: 0, skipped: 0 };
  const { dataset_id: datasetId, ads_access_token: accessToken } = await getIntegrationCredentials("meta", [
    "dataset_id",
    "ads_access_token",
  ]);
  if (!datasetId || !accessToken) {
    return { ...empty, reason: "Meta dataset ID or ads access token is not set (Settings → Integrations → Meta)." };
  }

  const since = new Date(now.getTime() - CAPI_MAX_AGE_DAYS * 86_400_000);
  const pending = await db
    .select({
      historyId: temperatureHistory.id,
      leadId: temperatureHistory.leadId,
      label: sql<string>`coalesce((select o.label from dropdown_options o where o.category = 'temperature' and o.value = ${temperatureHistory.toTemperature} limit 1), ${temperatureHistory.toTemperature})`,
      kind: sql<string | null>`(select o.metadata->>'kind' from dropdown_options o where o.category = 'temperature' and o.value = ${temperatureHistory.toTemperature} limit 1)`,
      changedAt: temperatureHistory.changedAt,
      phone: leads.primaryPhone,
      email: leads.email,
      attempts: sql<number>`coalesce((select e.attempts from meta_capi_events e where e.history_id = ${temperatureHistory.id}), 0)`,
    })
    .from(temperatureHistory)
    .innerJoin(leads, eq(leads.id, temperatureHistory.leadId))
    .where(
      and(
        gte(temperatureHistory.changedAt, since),
        isNotNull(temperatureHistory.toTemperature),
        sql`not exists (select 1 from meta_capi_events e where e.history_id = ${temperatureHistory.id} and e.status in ('sent', 'skipped'))`,
      ),
    )
    .orderBy(temperatureHistory.changedAt)
    .limit(1000);
  if (pending.length === 0) return empty;

  // The Meta lead id: the enquiry that came from a Meta lead ad stores it as its
  // dedupe key (a numeric id; click-to-WhatsApp enquiries use a `wa:` key).
  const metaEnquiries = await db
    .select({ leadId: enquiries.leadId, key: enquiries.dedupeKey })
    .from(enquiries)
    .where(
      and(
        inArray(enquiries.leadId, [...new Set(pending.map((p) => p.leadId))]),
        eq(enquiries.source, "meta"),
        sql`${enquiries.dedupeKey} ~ '^[0-9]{8,}$'`,
      ),
    );
  const metaLeadIdByLead = new Map<string, string>();
  for (const row of metaEnquiries) if (row.key && !metaLeadIdByLead.has(row.leadId)) metaLeadIdByLead.set(row.leadId, row.key);

  const result: CapiRunResult = { ...empty };
  const toSend: Array<{ p: (typeof pending)[number]; event: CapiEvent }> = [];

  for (const p of pending) {
    // A brand-new lead's first status ("Not contacted") is the form fill Meta
    // already knows about; reporting it would only add noise to the funnel.
    if (p.kind === "new") {
      await recordEvent(p.historyId, p.leadId, capiEventName(p.label), "skipped", "Starting status.", p.attempts);
      result.skipped += 1;
      continue;
    }
    const metaLeadId = metaLeadIdByLead.get(p.leadId);
    if (!metaLeadId) {
      // Not from a Meta lead ad: nothing to tie the event to.
      await recordEvent(p.historyId, p.leadId, capiEventName(p.label), "skipped", "Not from a Meta lead ad.", p.attempts);
      result.skipped += 1;
      continue;
    }
    toSend.push({
      p,
      event: {
        event_name: capiEventName(p.label),
        event_time: Math.floor(p.changedAt.getTime() / 1000),
        event_id: p.historyId,
        action_source: "system_generated",
        user_data: {
          lead_id: metaLeadId,
          ...(p.phone ? { ph: [sha256Hex(normalizePhoneForHash(p.phone))] } : {}),
          ...(p.email ? { em: [sha256Hex(normalizeEmailForHash(p.email))] } : {}),
        },
        custom_data: { event_source: "crm", lead_event_source: "AFD India CRM" },
      },
    });
  }

  for (let i = 0; i < toSend.length; i += BATCH) {
    const chunk = toSend.slice(i, i + BATCH);
    try {
      await sendCapiEvents(datasetId, accessToken, chunk.map((c) => c.event));
      for (const c of chunk) await recordEvent(c.p.historyId, c.p.leadId, c.event.event_name, "sent", null, c.p.attempts);
      result.sent += chunk.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const c of chunk) await recordEvent(c.p.historyId, c.p.leadId, c.event.event_name, "failed", message, c.p.attempts);
      result.failed += chunk.length;
    }
  }
  return result;
}

async function recordEvent(
  historyId: string,
  leadId: string,
  eventName: string,
  status: "sent" | "failed" | "skipped",
  error: string | null,
  previousAttempts: number,
): Promise<void> {
  await db
    .insert(metaCapiEvents)
    .values({
      historyId,
      leadId,
      eventName,
      status,
      error,
      attempts: previousAttempts + 1,
      sentAt: status === "sent" ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: metaCapiEvents.historyId,
      set: { status, error, eventName, attempts: previousAttempts + 1, sentAt: status === "sent" ? new Date() : null },
    });
}
