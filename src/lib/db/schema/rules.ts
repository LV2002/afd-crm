import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  time,
  date,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { centers } from "./org";

/**
 * Same JSONB condition grammar as assignment_rules (Phase 1): an AND-array
 * of { field, op, value } predicates. First match by priority wins.
 * Evaluated nightly and on activity — the cron job is Phase 2 (SLA/temp
 * recompute); this table only stores the configuration.
 */
export const temperatureRules = pgTable("temperature_rules", {
  id: idColumn(),
  /** A dropdown_options.value where category = 'temperature'. No hard FK —
   *  dropdown_options is keyed by id, not (category, value). Validated by
   *  the settings form against the live temperature options list. */
  temperatureValue: text("temperature_value").notNull(),
  priority: integer("priority").notNull().default(0),
  conditions: jsonb("conditions").$type<Record<string, unknown>>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
  ...softDelete(),
});

export const slaMeasureEnum = pgEnum("sla_measure", [
  "first_response",
  "next_followup",
  "in_stage",
]);

export const slaPolicies = pgTable("sla_policies", {
  id: idColumn(),
  name: text("name").notNull(),
  priority: integer("priority").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  /** Same condition grammar as temperature_rules/assignment_rules. Empty/null = applies to all. */
  appliesTo: jsonb("applies_to").$type<Record<string, unknown>>(),
  measure: slaMeasureEnum("measure").notNull(),
  targetHours: integer("target_hours").notNull(),
  businessHoursOnly: boolean("business_hours_only").notNull().default(false),
  /** Ordered array: [{ at_hours, notify_roles: uuid[], notify_owner?, flag_breach?, unassign?, requeue? }] */
  escalations: jsonb("escalations").$type<Array<Record<string, unknown>>>(),
  ...timestamps(),
  ...softDelete(),
});

export const businessHours = pgTable(
  "business_hours",
  {
    id: idColumn(),
    centerId: uuid("center_id")
      .notNull()
      .references(() => centers.id, { onDelete: "cascade" }),
    /** 0 = Sunday .. 6 = Saturday. */
    dayOfWeek: integer("day_of_week").notNull(),
    opensAt: time("opens_at"),
    closesAt: time("closes_at"),
    isClosed: boolean("is_closed").notNull().default(false),
    ...timestamps(),
  },
  (t) => [uniqueIndex("business_hours_center_day_uq").on(t.centerId, t.dayOfWeek)],
);

export const holidays = pgTable(
  "holidays",
  {
    id: idColumn(),
    centerId: uuid("center_id")
      .notNull()
      .references(() => centers.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    name: text("name").notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("holidays_center_date_uq").on(t.centerId, t.date)],
);
