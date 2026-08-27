import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { centers } from "./org";
import { profiles } from "./auth";
import { leads } from "./leads";

/**
 * CLAUDE.md non-negotiable #4: assignment is a rules engine, one table with
 * JSONB conditions and a priority order — adding "assign Kannur + Meta +
 * NIFT to Athira" must require zero schema changes.
 *
 * `conditions` is an AND-array under a top-level "all" key, evaluated
 * against the whitelisted fields in src/lib/assignment/evaluate-conditions.ts
 * — never raw SQL. Rules are evaluated in ascending `priority` order
 * (lower number first); the first active rule whose conditions match wins.
 *
 * `action` shapes:
 *   fixed:       { strategy: 'fixed', assignTo: uuid, centerId?: uuid }
 *   round_robin: { strategy: 'round_robin', userIds: uuid[], centerId?: uuid, cursor?: number }
 * `cursor` is mutated in place by applyAssignment() as rotation state —
 * it's the only field on a rule that isn't admin-authored.
 */
export const assignmentRules = pgTable("assignment_rules", {
  id: idColumn(),
  name: text("name").notNull(),
  priority: integer("priority").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  conditions: jsonb("conditions").$type<Record<string, unknown>>().notNull(),
  action: jsonb("action").$type<Record<string, unknown>>().notNull(),
  /** Which triggers re-run this rule: 'create' and/or 'update' (reassignment). */
  appliesOn: text("applies_on").array().notNull().default(["create"]),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  ...timestamps(),
  ...softDelete(),
});

export const assignmentReasonEnum = pgEnum("assignment_reason", [
  "rule",
  "manual",
  "round_robin",
  "reassign_sla",
]);

/**
 * Append-only, like stage_history — written by applyAssignment(), never
 * updated or deleted. A null fromUser/fromCenter means the lead was
 * previously unassigned; a null toUser/toCenter is only possible for a
 * manual unassignment, never for a rule match (a rule that "matches" but
 * assigns nothing isn't a match — see evaluate-conditions.ts).
 */
export const assignmentHistory = pgTable("assignment_history", {
  id: idColumn(),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  fromUser: uuid("from_user").references(() => profiles.id, { onDelete: "set null" }),
  toUser: uuid("to_user").references(() => profiles.id, { onDelete: "set null" }),
  fromCenter: uuid("from_center").references(() => centers.id, { onDelete: "set null" }),
  toCenter: uuid("to_center").references(() => centers.id, { onDelete: "set null" }),
  ruleId: uuid("rule_id").references(() => assignmentRules.id, { onDelete: "set null" }),
  reason: assignmentReasonEnum("reason").notNull(),
  /** Null for a system/cron actor (a rule firing on ingestion). */
  actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
