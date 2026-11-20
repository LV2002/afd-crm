import { sql } from "drizzle-orm";
import { integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
