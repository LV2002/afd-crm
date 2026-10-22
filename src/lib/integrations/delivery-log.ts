import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { mapFormPayload } from "@/lib/integrations/form-payload/map-fields";
import { maskPhone } from "@/lib/leads/mask-phone";

import { classifyDelivery, type DeliveryOutcome } from "./classify-delivery";

export interface DeliveryLogRow {
  id: string;
  receivedAt: string;
  /** "Google Ads" for a custom endpoint, "WhatsApp" for the built-in one. */
  channel: string;
  /** Filter key: `custom:<uuid>` or the source name. */
  channelKey: string;
  outcome: DeliveryOutcome;
  reason: string | null;
  /** Read from the payload where it is a form, phone masked. */
  who: string | null;
  phone: string | null;
  leadId: string | null;
  leadNumber: number | null;
  duplicates: number;
  lastDuplicateAt: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram DMs",
  meta_leads: "Meta Lead Ads",
  google_leads: "Google Lead Forms",
  website: "Website forms",
  custom: "Custom endpoint",
  knorish: "Knorish",
};

type Row = Record<string, unknown>;
const rowsOf = (result: unknown): Row[] =>
  Array.isArray(result) ? (result as Row[]) : ((result as { rows?: Row[] }).rows ?? []);

const iso = (value: unknown): string | null => (value ? new Date(value as string).toISOString() : null);

/**
 * Every delivery in the window, newest first, with what became of it.
 *
 * The enquiry is joined on `dedupe_key` — the custom and website handlers
 * set it to the delivery's own id — so "created a lead" and "added to an
 * existing one" come from the enquiry itself and not from a guess.
 * Capped, because this is for reading, not exporting.
 */
export async function getDeliveryLog(options: {
  days: number;
  endpoint?: string | null;
  limit?: number;
}): Promise<DeliveryLogRow[]> {
  const { days, endpoint } = options;
  const limit = options.limit ?? 500;

  const endpointFilter = !endpoint
    ? sql``
    : endpoint.startsWith("custom:")
      ? sql`and we.custom_webhook_id = ${endpoint.slice("custom:".length)}::uuid`
      : sql`and we.source::text = ${endpoint} and we.custom_webhook_id is null`;

  const result = await db.execute(sql`
    select
      we.id, we.source::text as source, we.received_at, we.status::text as status,
      we.signature_ok, we.last_error, we.raw, we.custom_webhook_id,
      we.duplicate_count, we.last_duplicate_at,
      cw.name as endpoint_name,
      enq.lead_id, enq.was_duplicate,
      l.lead_number, l.primary_phone
    from webhook_events we
    left join custom_webhooks cw on cw.id = we.custom_webhook_id
    left join lateral (
      select e.lead_id, e.was_duplicate
      from enquiries e
      where e.dedupe_key = we.external_id
      order by e.created_at
      limit 1
    ) enq on true
    left join leads l on l.id = enq.lead_id
    where we.received_at > now() - make_interval(days => ${days})
    ${endpointFilter}
    order by we.received_at desc
    limit ${limit}
  `);

  return rowsOf(result).map((r) => {
    const source = String(r.source);
    const customId = (r.custom_webhook_id as string | null) ?? null;
    const raw = (r.raw ?? {}) as Record<string, unknown>;

    // Only form-shaped payloads can be read back into a person; a WhatsApp
    // message or a status carries something else entirely.
    let who: string | null = null;
    let phone: string | null = null;
    if (source === "custom" || source === "website") {
      try {
        const mapped = mapFormPayload(raw);
        if (mapped.ok) {
          who = mapped.lead.studentName;
          phone = maskPhone(mapped.lead.primaryPhone);
        }
      } catch {
        /* an unreadable payload is a row without a name, not a broken page */
      }
    }

    const enquiry = r.lead_id ? { wasDuplicate: r.was_duplicate === true } : null;
    return {
      id: String(r.id),
      receivedAt: new Date(r.received_at as string).toISOString(),
      channel: customId ? String(r.endpoint_name ?? "Custom endpoint (removed)") : (SOURCE_LABELS[source] ?? source),
      channelKey: customId ? `custom:${customId}` : source,
      outcome: classifyDelivery({
        signatureOk: r.signature_ok === true,
        status: String(r.status),
        enquiry,
      }),
      reason: (r.last_error as string | null) ?? null,
      who,
      phone,
      leadId: (r.lead_id as string | null) ?? null,
      leadNumber: r.lead_number === null || r.lead_number === undefined ? null : Number(r.lead_number),
      duplicates: Number(r.duplicate_count ?? 0),
      lastDuplicateAt: iso(r.last_duplicate_at),
    };
  });
}

/** The channels offered in the filter: every custom endpoint, and every built-in source that has delivered. */
export async function getDeliveryChannels(): Promise<Array<{ key: string; label: string }>> {
  const result = await db.execute(sql`
    select 'custom:' || cw.id::text as key, cw.name as label
    from custom_webhooks cw
    where cw.deleted_at is null
    union all
    select distinct we.source::text as key, we.source::text as label
    from webhook_events we
    where we.custom_webhook_id is null
    order by label
  `);
  return rowsOf(result).map((r) => ({
    key: String(r.key),
    label: r.key && String(r.key).startsWith("custom:") ? String(r.label) : (SOURCE_LABELS[String(r.key)] ?? String(r.key)),
  }));
}
