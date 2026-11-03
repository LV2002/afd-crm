import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { profiles } from "./auth";
import { leads } from "./leads";
import { centers } from "./org";

/**
 * The contact database: people we hold details for who are not leads.
 *
 * School-seminar attendees, purchased lists, exam-application data. Kept
 * apart from `leads` deliberately — a lead is the sales object, with an owner,
 * a response clock, a status and a place in every report, and a thousand
 * people who have not enquired must have none of that. They are here to be
 * retargeted; the few who turn out to be real enquiries are moved across
 * (or merged with the lead they already are) and stay in this table too.
 */

/** One batch of contacts with one origin: "St Xavier's seminar, Nov 2026". */
export const contactLists = pgTable(
  "contact_lists",
  {
    id: idColumn(),
    name: text("name").notNull(),
    /** A `lead_source` option value, carried onto a lead created from one of these contacts. */
    source: text("source"),
    description: text("description"),
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "set null" }),
    /** Whether this list may feed Meta and Google retargeting audiences. */
    useForAds: boolean("use_for_ads").notNull().default(true),
    /**
     * Whether people on this list may be sent WhatsApp messages. Off by
     * default: a number that never agreed to hear from the institute is how a
     * WhatsApp number gets restricted, and the institute has one.
     */
    useForWhatsapp: boolean("use_for_whatsapp").notNull().default(false),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [uniqueIndex("contact_lists_name_uq").on(t.name).where(sql`archived_at is null`)],
);

/**
 * One row per PERSON, however many lists they appear on.
 *
 * Matched by phone, then email, the way leads are: a student at a seminar who
 * is also in a purchased exam database is one contact on two lists, not two
 * rows that would each be retargeted. `fields` holds every other lead field
 * by its key (class, school, city, a custom field), so a field an admin adds
 * to leads is available here with no migration.
 */
export const contacts = pgTable(
  "contacts",
  {
    id: idColumn(),
    name: text("name").notNull(),
    /** E.164. Null when all we have is an email. */
    phone: text("phone"),
    /** Lowercased and trimmed. */
    email: text("email"),
    fields: jsonb("fields").$type<Record<string, unknown>>().notNull().default({}),
    /**
     * The lead this person became or was merged into. Kept after the move:
     * the contact stays in the database, marked as a lead, so the list still
     * says who has already responded.
     */
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    linkedAt: timestamp("linked_at", { withTimezone: true }),
    linkedBy: uuid("linked_by").references(() => profiles.id, { onDelete: "set null" }),
    /** `moved` (a new lead was created) or `merged` (they were already a lead). */
    linkedHow: text("linked_how"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex("contacts_phone_uq").on(t.phone).where(sql`deleted_at is null and phone is not null`),
    uniqueIndex("contacts_email_uq").on(t.email).where(sql`deleted_at is null and email is not null`),
    index("contacts_lead_idx").on(t.leadId),
    index("contacts_created_idx").on(t.createdAt),
  ],
);

export const contactListMembers = pgTable(
  "contact_list_members",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    listId: uuid("list_id")
      .notNull()
      .references(() => contactLists.id, { onDelete: "cascade" }),
    addedBy: uuid("added_by").references(() => profiles.id, { onDelete: "set null" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.listId] }), index("contact_members_list_idx").on(t.listId)],
);
