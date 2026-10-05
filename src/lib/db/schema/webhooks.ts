import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { profiles } from "./auth";
import { centers } from "./org";

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
  "instagram",
  /**
   * One handler, many endpoints: a row in `custom_webhooks` says which.
   *
   * This is the exception that proves the rule above rather than breaking
   * it. `custom` has a real handler, and the handler is generic — it
   * looks the endpoint up by its URL token, maps whatever JSON arrived
   * with the shared form-payload mapper, and stamps the source the admin
   * chose. Adding a Knorish feed is then configuration, not a deploy.
   *
   * `knorish` above is the counter-example and is now dead: it was added
   * for a handler that was never written, which is precisely what that
   * comment warns against. It stays in the enum because removing a value
   * from a Postgres enum means rewriting the type, and it is harmless —
   * but a Knorish feed set up today goes through `custom`.
   */
  "custom",
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
    /**
     * Which custom endpoint this came in on, for `source = 'custom'`.
     *
     * The uniqueness key stays `(source, external_id)`, so the handler
     * prefixes the sender's own id with this endpoint's uuid — two
     * different feeds both numbering their submissions from 1 must not
     * collide, and a partial index would have been a second rule to keep
     * in step with the first.
     */
    customWebhookId: uuid("custom_webhook_id").references((): AnyPgColumn => customWebhooks.id, {
      onDelete: "set null",
    }),
  },
  (t) => [uniqueIndex("webhook_events_source_external_id_uq").on(t.source, t.externalId)],
);

/**
 * An endpoint an admin created, for a source nobody wrote a handler for.
 *
 * The problem: every new lead source needed a route handler, a signature
 * scheme and a deploy, so a course platform or a one-off landing page
 * either waited for developer time or kept its leads in a spreadsheet.
 * Meanwhile `webhook_source` carried a `knorish` value for a handler that
 * was never written — a dead switch, which is the failure mode this
 * project keeps finding.
 *
 * So the handler is generic and the endpoints are rows. Each one has its
 * own unguessable URL, its own signing secret, and its own `source`
 * stamped on every enquiry it creates, which is what makes the sources
 * report able to tell Knorish from a Google Form.
 *
 * What it is NOT is a second ingestion path. The handler calls
 * `resolveOrCreateLead()` then `applyAssignment()` like every other
 * source (non-negotiable #8), and persists the raw payload before
 * processing it (non-negotiable #9).
 */
export const customWebhooks = pgTable(
  "custom_webhooks",
  {
    id: idColumn(),
    /** What an admin calls it: "Knorish course purchases". */
    name: text("name").notNull(),
    /**
     * The random token in the URL, and the only thing that identifies the
     * endpoint. Long enough to be unguessable, because for a sender that
     * cannot sign a request it is the whole of the authentication.
     */
    slug: text("slug").notNull(),
    /**
     * The `lead_source` value stamped on every enquiry from this
     * endpoint. Upserted into `dropdown_options` when the webhook is
     * saved, so the sources report has a label for it rather than a bare
     * string nobody configured.
     */
    source: text("source").notNull(),
    /** A fixed sub-source, when the sender does not supply one. */
    subSource: text("sub_source"),
    /**
     * A centre to stamp when the payload carries none. Optional: left
     * null, assignment rules decide, exactly as they do for a Meta lead
     * with no centre on it.
     */
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "set null" }),
    /** Shared secret for the `X-AFD-Signature` HMAC. Always generated. */
    signingSecret: text("signing_secret").notNull(),
    /**
     * Whether a valid signature is required.
     *
     * True by default and the right answer. Turned off for a sender that
     * physically cannot sign — some course platforms and form builders
     * only offer "POST this JSON to a URL" — and then the URL token is
     * the only credential. The screen says so in those words rather than
     * letting somebody turn it off without knowing what they traded.
     */
    requireSignature: boolean("require_signature").notNull().default(true),
    /**
     * Extra field aliases for this sender, merged in front of the
     * built-in list: `{"phone": ["mob"], "name": ["buyer"]}`.
     *
     * The mapper already matches most spellings of most fields. This is
     * for the sender that calls the phone number something nobody
     * predicted, so the fix is a text box rather than a deploy.
     */
    fieldAliases: jsonb("field_aliases").$type<Record<string, string[]>>(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [uniqueIndex("custom_webhooks_slug_uq").on(t.slug)],
);
