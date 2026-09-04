import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_helpers";
import { profiles } from "./auth";
import { students } from "./finance";
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

export const whatsappAudienceEntityEnum = pgEnum("whatsapp_audience_entity", ["lead", "student"]);

/**
 * A template-based bulk send — template-based by definition, since a
 * broadcast is always outside any individual recipient's 24-hour customer
 * service window.
 *
 * The audience started as "one lead tag" and is now a filter set over any
 * lead or student variable, the same grammar the Insights pivot uses
 * (`lib/reports/pivot.ts`). Leon's words: "categorise the leads and
 * students just like in insights with all the variables and customize who
 * I want to send the message to." A tag is still one of the things you
 * can filter on, so nothing that worked before stopped working.
 *
 * `audience_entity`/`audience_filters`/`tag_id` record what the audience
 * WAS at creation time, for reading later. The actual recipient list is
 * snapshotted into `whatsapp_broadcast_recipients` immediately and never
 * recomputed, so a lead whose stage changes mid-send doesn't change who
 * the broadcast reaches.
 */
export const whatsappBroadcasts = pgTable("whatsapp_broadcasts", {
  id: idColumn(),
  name: text("name").notNull(),
  /** Whether this went to leads or to enrolled students — they are different tables and different people. */
  audienceEntity: whatsappAudienceEntityEnum("audience_entity").notNull().default("lead"),
  /** `{ fieldKey: value }`, exactly the shape the Insights filter bar produces. Null means "everybody in the entity". */
  audienceFilters: jsonb("audience_filters").$type<Record<string, string>>(),
  /** Optional extra narrowing by tag. Nullable since the audience no longer has to be a tag at all. */
  tagId: uuid("tag_id").references(() => tags.id, { onDelete: "restrict" }),
  templateName: text("template_name").notNull(),
  templateLanguage: text("template_language").notNull().default("en_US"),
  bodyParam: text("body_param"),
  /**
   * The file filling the template's media header on this send, if it has
   * one. Meta's media id from the /media upload, not a file of ours — it
   * is uploaded once per broadcast and reused for every recipient, and
   * expires on Meta's side after 30 days.
   */
  headerMediaId: text("header_media_id"),
  headerMediaKind: text("header_media_kind"),
  headerMediaFilename: text("header_media_filename"),
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
 * One row per targeted person, sent by the cron sweep in batches (never
 * synchronously from the create action — an audience of a few hundred
 * would blow past a serverless function's request timeout, same reasoning
 * as every other cron-driven bulk job in this codebase).
 *
 * Exactly one of `lead_id`/`student_id` is set, enforced by a check
 * constraint: a recipient is a person in one of the two tables, and the
 * pair being nullable is not licence for a row that points at neither.
 * `phone` is snapshotted at creation time for the same reason the
 * audience is — the send goes to the number that was true when the
 * broadcast was composed.
 */
export const whatsappBroadcastRecipients = pgTable(
  "whatsapp_broadcast_recipients",
  {
    id: idColumn(),
    broadcastId: uuid("broadcast_id")
      .notNull()
      .references(() => whatsappBroadcasts.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").references(() => students.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    status: whatsappBroadcastRecipientStatusEnum("status").notNull().default("queued"),
    waMessageId: text("wa_message_id"),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("whatsapp_broadcast_recipients_broadcast_id_lead_id_uq")
      .on(t.broadcastId, t.leadId)
      .where(sql`lead_id is not null`),
    uniqueIndex("whatsapp_broadcast_recipients_broadcast_id_student_id_uq")
      .on(t.broadcastId, t.studentId)
      .where(sql`student_id is not null`),
    check(
      "whatsapp_broadcast_recipients_one_subject",
      sql`num_nonnulls(lead_id, student_id) = 1`,
    ),
  ],
);
