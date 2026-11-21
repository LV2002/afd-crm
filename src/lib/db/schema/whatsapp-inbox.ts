import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { idColumn } from "./_helpers";
import { profiles } from "./auth";
import { leads } from "./leads";

/** Messages staff send often, typed in from a slash: /fees. Shared by everybody who can send. */
export const whatsappSavedReplies = pgTable(
  "whatsapp_saved_replies",
  {
    id: idColumn(),
    title: text("title").notNull(),
    shortcut: text("shortcut"),
    body: text("body").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("whatsapp_saved_replies_shortcut_uq").on(sql`lower(${t.shortcut})`).where(sql`deleted_at is null and shortcut is not null`)],
);

export type LabelColour = "slate" | "green" | "amber" | "blue" | "violet" | "red";

/** Tags put on a conversation: Interested, Fee query, Demo class. */
export const whatsappLabels = pgTable(
  "whatsapp_labels",
  {
    id: idColumn(),
    name: text("name").notNull(),
    colour: text("colour").$type<LabelColour>().notNull().default("slate"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("whatsapp_labels_name_uq").on(sql`lower(${t.name})`).where(sql`deleted_at is null`)],
);

/** Whether somebody has dealt with a conversation. Reopens by itself when they write again. */
export const whatsappConversations = pgTable("whatsapp_conversations", {
  phone: text("phone").primaryKey(),
  status: text("status").$type<"open" | "resolved">().notNull().default("open"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by").references(() => profiles.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const whatsappConversationLabels = pgTable(
  "whatsapp_conversation_labels",
  {
    phone: text("phone").notNull(),
    labelId: uuid("label_id")
      .notNull()
      .references(() => whatsappLabels.id, { onDelete: "cascade" }),
    addedBy: uuid("added_by").references(() => profiles.id, { onDelete: "set null" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.phone, t.labelId] })],
);

/** Staff-only notes on a conversation. Never sent to the person. */
export const whatsappNotes = pgTable("whatsapp_notes", {
  id: idColumn(),
  phone: text("phone").notNull(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The institute's greeting and away messages on the API number. One row per kind. */
export const whatsappAutoReplies = pgTable("whatsapp_auto_replies", {
  kind: text("kind").$type<"greeting" | "away">().primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  message: text("message").notNull(),
  /** Open days, 0 = Sunday … 6 = Saturday (IST). */
  days: integer("days").array().notNull().default(sql`'{1,2,3,4,5,6}'`),
  opensAt: text("opens_at").notNull().default("09:00"),
  closesAt: text("closes_at").notNull().default("18:00"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
});

/** When an auto-reply last went to a number, so it is never sent twice in a row. */
export const whatsappAutoReplyLog = pgTable(
  "whatsapp_auto_reply_log",
  {
    id: idColumn(),
    phone: text("phone").notNull(),
    kind: text("kind").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("whatsapp_auto_reply_log_phone_kind_idx").on(t.phone, t.kind, t.sentAt)],
);

/** A tracked short link: /l/<code> counts the click and redirects to `url`. */
export const whatsappLinks = pgTable(
  "whatsapp_links",
  {
    id: idColumn(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    clicks: integer("clicks").notNull().default(0),
    lastClickedAt: timestamp("last_clicked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("whatsapp_links_code_uq").on(t.code)],
);

/** How long a chat may wait for a reply, and what happens to chats on leads nobody owns. One row. */
export const whatsappChatRules = pgTable("whatsapp_chat_rules", {
  id: text("id").primaryKey().default("default"),
  alertEnabled: boolean("alert_enabled").notNull().default(false),
  alertMinutes: integer("alert_minutes").notNull().default(30),
  escalateMinutes: integer("escalate_minutes").notNull().default(120),
  autoAssignUnowned: boolean("auto_assign_unowned").notNull().default(false),
  /** Lets staff ask Gemini for a draft reply. Off by default: it sends a conversation's recent messages to Google. */
  aiSuggestEnabled: boolean("ai_suggest_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
});

/** Which overdue-reply alerts have gone out, so none is sent twice for the same unanswered message. */
export const whatsappReplyAlerts = pgTable(
  "whatsapp_reply_alerts",
  {
    id: idColumn(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    inboundAt: timestamp("inbound_at", { withTimezone: true }).notNull(),
    level: integer("level").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("whatsapp_reply_alerts_uq").on(t.leadId, t.inboundAt, t.level)],
);

/** A native WhatsApp form (Meta "Flow"): the fields to ask, and the id Meta gave it once published. */
export const whatsappForms = pgTable(
  "whatsapp_forms",
  {
    id: idColumn(),
    name: text("name").notNull(),
    introText: text("intro_text").notNull(),
    buttonLabel: text("button_label").notNull().default("Fill the form"),
    /** Keys from the fixed list of lead fields a question may fill (`ASK_FIELDS`). */
    fields: text("fields").array().notNull(),
    metaFlowId: text("meta_flow_id"),
    status: text("status").$type<"draft" | "published" | "error">().notNull().default("draft"),
    lastError: text("last_error"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [check("whatsapp_forms_status_check", sql`status in ('draft','published','error')`)],
);

/**
 * A payment link sent over WhatsApp. A request for money, not a payment:
 * nothing here touches the ledger (payments and receipts are append-only
 * and recorded by accounts). When Razorpay reports it paid, the row is marked
 * and accounts is told to record it.
 */
export const whatsappPaymentLinks = pgTable(
  "whatsapp_payment_links",
  {
    id: idColumn(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    description: text("description").notNull(),
    razorpayLinkId: text("razorpay_link_id"),
    shortUrl: text("short_url"),
    status: text("status").$type<"created" | "paid" | "expired" | "cancelled" | "failed">().notNull().default("created"),
    razorpayPaymentId: text("razorpay_payment_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [
    check("whatsapp_payment_links_status_check", sql`status in ('created','paid','expired','cancelled','failed')`),
    check("whatsapp_payment_links_amount_check", sql`amount_paise > 0`),
    uniqueIndex("whatsapp_payment_links_razorpay_link_id_uq").on(t.razorpayLinkId).where(sql`razorpay_link_id is not null`),
    index("whatsapp_payment_links_lead_id_idx").on(t.leadId),
  ],
);
