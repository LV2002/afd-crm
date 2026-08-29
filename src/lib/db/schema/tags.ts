import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { profiles } from "./auth";
import { leads } from "./leads";

/**
 * Admin-configurable labels a lead can carry — CLAUDE.md's "What is
 * configurable" table doesn't name tags explicitly, but they're the same
 * shape as dropdown_options: an enumerated list an admin should be able to
 * add to without a deploy. Distinct from dropdown_options because a lead
 * can carry many tags at once (many-to-many via lead_tags), where every
 * dropdown-backed field on a lead is single-valued.
 */
export const tags = pgTable(
  "tags",
  {
    id: idColumn(),
    name: text("name").notNull(),
    color: text("color"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [uniqueIndex("tags_name_uq").on(t.name)],
);

/**
 * The join row. No `updated_at`/status column on purpose — tagging is a
 * toggle (apply or remove), never an edit of an existing tag application;
 * `taggedAt`/`taggedBy` are the audit trail for when/who applied it.
 */
export const leadTags = pgTable(
  "lead_tags",
  {
    id: idColumn(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "restrict" }),
    taggedBy: uuid("tagged_by").references(() => profiles.id, { onDelete: "set null" }),
    taggedAt: timestamp("tagged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("lead_tags_lead_id_tag_id_uq").on(t.leadId, t.tagId)],
);
