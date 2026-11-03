import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_helpers";
import { leads, temperatureHistory } from "./leads";

/**
 * "Plug and play" integrations (Meta, Google, WhatsApp, telephony): every
 * credential an admin types into a Settings screen lands here, encrypted,
 * instead of an env var — the whole point is that connecting a new ad
 * account or WhatsApp number needs no deploy. See
 * `src/lib/integrations/credentials.ts` for the encrypt/decrypt helpers
 * that are the only code allowed to touch `value_encrypted`.
 *
 * `scope_id` is null for an org-wide credential (Meta's app secret, a
 * Google Ads developer token) and a profile id for a per-counsellor one
 * (a WhatsApp Business number assigned to one counsellor) — deliberately
 * NOT a hard FK to `profiles`, so a credential can outlive the profile row
 * being deleted rather than silently cascading away a working integration;
 * `deleteIntegrationCredential()` is the only cleanup path.
 */
export const integrationProviderEnum = pgEnum("integration_provider", [
  "meta",
  "google",
  "whatsapp",
  "telephony",
  /** The institute's own website forms — see api/webhooks/website. */
  "website",
]);

export const integrationCredentials = pgTable(
  "integration_credentials",
  {
    id: idColumn(),
    provider: integrationProviderEnum("provider").notNull(),
    key: text("key").notNull(),
    valueEncrypted: text("value_encrypted").notNull(),
    scopeId: uuid("scope_id"),
    ...timestamps(),
  },
  (t) => [
    // Two partial indexes rather than one plain unique(provider, key,
    // scope_id) — Postgres never treats two NULLs as conflicting under a
    // plain unique index, so that alone wouldn't stop two org-wide rows
    // for the same key.
    uniqueIndex("integration_credentials_org_key_uq")
      .on(t.provider, t.key)
      .where(sql`scope_id is null`),
    uniqueIndex("integration_credentials_scoped_key_uq")
      .on(t.provider, t.key, t.scopeId)
      .where(sql`scope_id is not null`),
  ],
);

/**
 * Status changes waiting to be reported to the marketing sheet, and the
 * record of having reported them.
 *
 * One row per `temperature_history` row, so "has this change been sent?" is
 * answered by a join rather than a flag on the lead that would have to be
 * kept in step. The receiving script stores a repeated event once, which is
 * what makes retrying after a failure safe; the rows here exist so a
 * failure is never silent and nothing is sent twice by this side either.
 *
 * Never holds a name or phone number: `note` is course and centre only.
 */
export const outcomeEvents = pgTable(
  "outcome_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The status change this reports. Unique: one event per change. */
    historyId: uuid("history_id")
      .notNull()
      .references(() => temperatureHistory.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    submissionId: text("submission_id").notNull(),
    /** contacted | demo_booked | admitted | lost — see lib/outcomes/status.ts. */
    status: text("status").notNull(),
    eventAt: timestamp("event_at", { withTimezone: true }).notNull(),
    revenueInr: integer("revenue_inr"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    /** Set when the change is deliberately not reported (same status as before, bad id, refused). */
    skippedReason: text("skipped_reason"),
  },
  (t) => [
    uniqueIndex("outcome_events_history_uq").on(t.historyId),
    index("outcome_events_pending_idx")
      .on(t.eventAt)
      .where(sql`sent_at is null and skipped_reason is null`),
    index("outcome_events_lead_idx").on(t.leadId),
  ],
);
