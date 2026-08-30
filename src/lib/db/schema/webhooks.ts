import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { idColumn } from "./_helpers";

/**
 * One entry per known webhook source — fixed in code like a permission
 * primitive, not admin-configurable data, because adding a new source
 * means writing the actual handler that processes it (CLAUDE.md's "each
 * primitive is an enforcement point" reasoning applies here too: a source
 * with no matching `case` in the processor is a dead value, so the list
 * has to track what's actually implemented).
 */
export const webhookSourceEnum = pgEnum("webhook_source", [
  "meta_leads",
  "google_leads",
  "whatsapp",
  "website",
  "knorish",
]);

export const webhookStatusEnum = pgEnum("webhook_status", ["pending", "done", "failed"]);

/**
 * CLAUDE.md non-negotiable #9: "verify, persist, then process." Every
 * webhook handler writes the raw payload here — signature checked first,
 * but persisted regardless of whether it passed, so a bad-signature
 * attempt is itself forensic evidence, not silently dropped — before
 * touching `resolveOrCreateLead()` or anything else. `UNIQUE(source,
 * external_id)` is the idempotency key: Meta/Google/WhatsApp all retry
 * webhook delivery on a non-2xx response or a timeout, and re-processing
 * the same `leadgen_id` a second time must not create a second lead.
 * `status='failed'` rows stay here for manual replay rather than
 * vanishing — v1 caught every exception and returned 200, so failures
 * were invisible; this table is the fix.
 */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: idColumn(),
    source: webhookSourceEnum("source").notNull(),
    externalId: text("external_id").notNull(),
    signatureOk: boolean("signature_ok").notNull(),
    raw: jsonb("raw").notNull().$type<Record<string, unknown>>(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    status: webhookStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (t) => [uniqueIndex("webhook_events_source_external_id_uq").on(t.source, t.externalId)],
);
