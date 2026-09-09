import { sql } from "drizzle-orm";
import { bigint, check, date, index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { profiles } from "./auth";
import { centers } from "./org";

/**
 * What the institute is aiming for this month.
 *
 * Every number in this system has been descriptive: how many leads
 * arrived, how many enrolled, what it cost. None of it has ever been
 * compared against what somebody was *trying* to do, so nobody could open
 * the CRM on the 14th and see whether the month was on course.
 *
 * ## One table, three scopes
 *
 * A target is set for the whole institute (`center_id` and `owner_id`
 * both null), for one centre, or for one counsellor — and the three
 * coexist deliberately, because an institute sets a number for Kochi and
 * then splits it between the four people working there. They are not
 * summed: an org target is its own row and a genuine statement, not the
 * total of the centre rows, and reading it as a total is how a month
 * looks 200% achieved.
 *
 * ## Why the period is a date
 *
 * A `date` pinned to the 1st rather than a year/month pair, so ordering,
 * ranges and "the last six months" are ordinary SQL rather than string
 * arithmetic. The check constraint keeps it on the 1st.
 */
export const targets = pgTable(
  "targets",
  {
    id: idColumn(),
    /** Always the 1st of the month, in IST terms. */
    periodMonth: date("period_month").notNull(),
    /** Null for an institute-wide target. */
    centerId: uuid("center_id").references(() => centers.id, { onDelete: "cascade" }),
    /** Null unless this is one person's number. */
    ownerId: uuid("owner_id").references(() => profiles.id, { onDelete: "cascade" }),
    /** 'leads' | 'admissions' | 'revenue' */
    metric: text("metric").notNull(),
    /**
     * A count for leads and admissions; **paise** for revenue, like every
     * other money column here. One column rather than two because the
     * metric already says which it is, and a nullable pair invites a row
     * that sets neither.
     */
    targetValue: bigint("target_value", { mode: "number" }).notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index("targets_period_idx").on(t.periodMonth),
    index("targets_center_idx").on(t.centerId),
    index("targets_owner_idx").on(t.ownerId),
    check("targets_metric", sql`metric in ('leads','admissions','revenue')`),
    check("targets_value_positive", sql`target_value > 0`),
    check("targets_month_start", sql`extract(day from period_month) = 1`),
    // A target belongs to a person or a centre or the institute — never
    // to a person *within* a centre, which would be a fourth scope nobody
    // asked for and a second place the same number could live.
    check("targets_one_scope", sql`num_nonnulls(center_id, owner_id) <= 1`),
  ],
);
