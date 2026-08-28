import { sql } from "drizzle-orm";
import { check, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { profiles } from "./auth";
import { leads } from "./leads";

/**
 * Technical provenance of the log entry — not a business taxonomy an admin
 * would reconfigure (that's `type`, a dropdown_options category, below).
 * 'system' is for a future auto-logged entry (e.g. a Phase 6 telephony
 * integration); everything today is 'manual'.
 */
export const interactionSourceEnum = pgEnum("interaction_source", [
  "manual",
  "call",
  "whatsapp",
  "system",
]);

export const interactionDirectionEnum = pgEnum("interaction_direction", ["inbound", "outbound"]);

/**
 * docs/01-DATA-MODEL.md § Activity. "Mandatory next action on every
 * interaction log" (docs/02-BUILD-PHASES.md, Phase 1) is enforced here at
 * the database level, not just in the form: `next_action` is required for
 * every human-logged interaction. The exemption for `source = 'system'`
 * is deliberate — an automatic log entry (nothing wired up yet, but the
 * column exists for it) has no counsellor to have decided a next step.
 */
export const interactions = pgTable(
  "interactions",
  {
    id: idColumn(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    /** dropdown_options category 'interaction_type' — Call, WhatsApp, Email, Walk-in, etc. */
    type: text("type").notNull(),
    direction: interactionDirectionEnum("direction"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    durationSeconds: integer("duration_seconds"),
    /** dropdown_options category 'interaction_outcome' — Connected, Not Reachable, Converted, etc. */
    outcome: text("outcome"),
    notes: text("notes"),
    nextAction: text("next_action"),
    nextFollowupAt: timestamp("next_followup_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    source: interactionSourceEnum("source").notNull().default("manual"),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    check(
      "interactions_next_action_required",
      sql`${t.source} = 'system' or ${t.nextAction} is not null`,
    ),
  ],
);

export const taskStatusEnum = pgEnum("task_status", ["open", "done", "cancelled"]);

export const tasks = pgTable("tasks", {
  id: idColumn(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  assignedTo: uuid("assigned_to").references(() => profiles.id, { onDelete: "set null" }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  /** dropdown_options category 'task_type' — Follow-up Call, Document Collection, Demo, etc. */
  type: text("type"),
  title: text("title").notNull(),
  notes: text("notes"),
  status: taskStatusEnum("status").notNull().default("open"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: uuid("completed_by").references(() => profiles.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  ...timestamps(),
  ...softDelete(),
});
