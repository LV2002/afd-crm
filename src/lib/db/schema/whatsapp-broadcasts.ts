import { integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_helpers";
import { profiles } from "./auth";
import { leads } from "./leads";
import { tags } from "./tags";

export const whatsappBroadcastStatusEnum = pgEnum("whatsapp_broadcast_status", [
  "draft",
  "sending",
  "completed",
  "failed",
]);

export const whatsappBroadcastRecipientStatusEnum = pgEnum("whatsapp_broadcast_recipient_status", [
  "queued",
  "sent",
  "failed",
]);

/**
 * "The admin should be able to send out WhatsApp Business API broadcasts"
 * (Leon's original ask) — always template-based (a broadcast is by
 * definition outside any individual lead's 24-hour customer service
 * window) and always audience-scoped by an existing lead tag, reusing the
 * tagging feature already built rather than inventing a second, competing
 * audience-filter mechanism. `tag_id` records what the audience WAS at
 * creation time for reporting; the actual recipient list is snapshotted
 * into `whatsapp_broadcast_recipients` immediately (not recomputed live),
 * so a lead un-tagged mid-send doesn't change who the broadcast reaches.
 */
export const whatsappBroadcasts = pgTable("whatsapp_broadcasts", {
  id: idColumn(),
  name: text("name").notNull(),
  tagId: uuid("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "restrict" }),
  templateName: text("template_name").notNull(),
  templateLanguage: text("template_language").notNull().default("en_US"),
  bodyParam: text("body_param"),
  status: whatsappBroadcastStatusEnum("status").notNull().default("draft"),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  totalRecipients: integer("total_recipients").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps(),
});

/**
 * One row per targeted lead, sent by the cron sweep in batches (never
 * synchronously from the create action — a tag with a few hundred leads
 * would blow past a serverless function's request timeout, same reasoning
 * as every other cron-driven bulk job in this codebase). `phone` is
 * snapshotted from the lead at creation time for the same reason
 * `tag_id` is snapshotted above.
 */
export const whatsappBroadcastRecipients = pgTable(
  "whatsapp_broadcast_recipients",
  {
    id: idColumn(),
    broadcastId: uuid("broadcast_id")
      .notNull()
      .references(() => whatsappBroadcasts.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    status: whatsappBroadcastRecipientStatusEnum("status").notNull().default("queued"),
    waMessageId: text("wa_message_id"),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [uniqueIndex("whatsapp_broadcast_recipients_broadcast_id_lead_id_uq").on(t.broadcastId, t.leadId)],
);
