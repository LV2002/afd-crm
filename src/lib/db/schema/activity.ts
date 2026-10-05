import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
    /*
      A human-logged interaction has to say what happens next, and when.

      The date used to be optional, which made the next action a sentence
      nobody would ever be shown again: nothing surfaced the lead in the
      morning queue and nothing counted it against a response target.

      `outcome = 'converted'` is the one exemption — the student joined,
      so there is no next call. The VALUE is keyed on and not the label;
      `dropdown_options` rows stay admin-editable, and renaming
      "Converted" to "Joined" changes nothing here, exactly as renaming a
      `stage_type = 'won'` stage does not change what it means.

      Migration 0087 adds this NOT VALID, so interactions logged before it
      — a next action, no date — stay as the true record of what happened.

      `coalesce` on the outcome is load-bearing: a CHECK rejects a row only
      when its expression is FALSE, and `null = 'converted'` is NULL, so
      without it an interaction with no outcome chosen passed the whole
      constraint. That is exactly the row this is meant to catch.
    */
    check(
      "interactions_next_action_required",
      sql`${t.source} = 'system' or coalesce(${t.outcome}, '') = 'converted' or (${t.nextAction} is not null and ${t.nextFollowupAt} is not null)`,
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

/**
 * That the nightly job ran, and what each part of it did.
 *
 * Leon asked why yesterday's Meta ad spend had not appeared, and the CRM
 * could not answer. Nothing recorded a run at all: `runNightly()` returned
 * its result as JSON to whoever invoked the route, and that was the end of
 * it. Failures reached `error_events`, but three of the four ways this can
 * go wrong leave no trace there —
 *
 *  - the invocation is rejected before the handler runs (no `CRON_SECRET`
 *    on the deployment means every cron call gets a 401, and a 401 is not
 *    an exception),
 *  - a job runs and reports "not configured", which is a 200 and correct
 *    on a fresh instance,
 *  - a job is skipped for want of time in the run's budget.
 *
 * In all three the symptom is identical: a number that does not appear on
 * a screen. So the run writes itself down, and Platform Health reads it.
 * An empty table is itself the diagnosis — it means no run has ever
 * reached the handler.
 */
export const cronRuns = pgTable(
  "cron_runs",
  {
    id: idColumn(),
    /** `daily` today; a column rather than a constant so a second schedule can be told apart. */
    jobKey: text("job_key").notNull().default("daily"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
    durationMs: integer("duration_ms").notNull(),
    /** False when any job failed. Drives the colour of the panel. */
    ok: boolean("ok").notNull(),
    okCount: integer("ok_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    /**
     * Every job, with its status, duration, and the reason it was skipped
     * or the note it returned. The shape is `runNightly()`'s own result,
     * stored rather than reshaped: a column per job would need a migration
     * every time the list changes.
     */
    jobs: jsonb("jobs").notNull().$type<Array<Record<string, unknown>>>(),
    ...timestamps(),
  },
  (t) => [index("cron_runs_started_at_idx").on(t.startedAt.desc())],
);
