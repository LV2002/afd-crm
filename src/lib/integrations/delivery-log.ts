import "server-only";

import { inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { whatsappMessages } from "@/lib/db/schema";
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
  /** For WhatsApp: whether the delivery was a customer's message or a delivery receipt, and what became of it. */
  detail: string | null;
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

  const rows = rowsOf(result);

  // Which WhatsApp messages were actually written to the inbox. A delivery
  // can be "processed" and still show nothing on screen — it may have been
  // a delivery receipt rather than a message, or the message may be hidden
  // — and the log should say which, not leave it to be guessed.
  const messageIds = rows
    .filter((r) => String(r.source) === "whatsapp")
    .map((r) => (r.raw as Record<string, unknown> | null)?.id)
    .filter((id): id is string => typeof id === "string");
  const stored = new Map<string, boolean>(); // wa message id -> hidden?
  if (messageIds.length > 0) {
    const found = await db
      .select({ id: whatsappMessages.waMessageId, deletedAt: whatsappMessages.deletedAt })
      .from(whatsappMessages)
      .where(inArray(whatsappMessages.waMessageId, messageIds));
    for (const row of found) if (row.id) stored.set(row.id, row.deletedAt !== null);
  }

  return rows.map((r) => {
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

    const detail = source === "whatsapp" ? describeWhatsAppDelivery(raw, stored) : null;
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
      detail,
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

/**
 * What a stored WhatsApp delivery was, in a line.
 *
 * Two very different things arrive on the same webhook: a customer's
 * message, and a delivery receipt ("sent", "delivered", "read") for a
 * message the CRM sent. Both are "processed", and only the first one
 * becomes a chat — so a person who sent a message from their phone and
 * sees nothing needs to know which kind they are looking at.
 */
export function describeWhatsAppDelivery(
  raw: Record<string, unknown>,
  stored: ReadonlyMap<string, boolean>,
): string | null {
  const id = typeof raw.id === "string" ? raw.id : null;

  if (typeof raw.status === "string" && typeof raw.recipient_id === "string") {
    // A failed receipt carries Meta's reason; showing it here saves a trip
    // to the lead's chat to find out why a broadcast did not deliver.
    const first = Array.isArray(raw.errors) ? (raw.errors[0] as Record<string, unknown> | undefined) : undefined;
    const reason = first
      ? ` — ${[first.code, first.title ?? first.message].filter((part) => part !== undefined && part !== null).join(" ")}`
      : "";
    return `Receipt: ${raw.status} (to ${maskPhone(`+${raw.recipient_id}`)})${reason}`;
  }

  if (typeof raw.from === "string") {
    const text = (raw.text as { body?: unknown } | undefined)?.body;
    const what = typeof text === "string" && text.trim() ? `“${text.trim().slice(0, 60)}”` : String(raw.type ?? "message");
    const state = id === null || !stored.has(id) ? "not saved to Chats" : stored.get(id) ? "saved, but hidden" : "saved in Chats";
    return `Message from ${maskPhone(`+${raw.from}`)}: ${what} — ${state}`;
  }

  return null;
}
