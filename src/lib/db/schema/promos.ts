import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";
import { profiles } from "./auth";
import { enrolments } from "./finance";

/**
 * Named, pre-approved discounts — "Early Bird 10% until 30 June",
 * "Sibling ₹5,000", "Staff Ward 25%".
 *
 * `docs/01-DATA-MODEL.md` has listed `promos` since the beginning and
 * nothing ever implemented it. CLAUDE.md puts "Fees: structures, promos,
 * discount authority limits" on the list of things an admin changes at
 * runtime, so this is a table with a settings screen, never a constant.
 *
 * ## Pre-approved by definition
 *
 * The difference between a promo and a counsellor typing 10% into the fee
 * panel is authority. The institute decided on the offer in advance, wrote
 * down its cap and its expiry, and put it in this list — so applying one
 * is not the counsellor exercising personal authority and does not queue
 * for approval. That is the whole reason this is worth a table.
 *
 * What a promo cannot do is exceed its own terms, which is why the cap,
 * the dates, the courses and the centres live here rather than in
 * somebody's head.
 */
export const promos = pgTable(
  "promos",
  {
    id: idColumn(),
    name: text("name").notNull(),
    /** An optional short code somebody quotes on the phone. */
    code: text("code"),
    /** 'percentage' | 'fixed' */
    discountType: text("discount_type").notNull(),
    /** 0–100 for a percentage offer. */
    percentValue: numeric("percent_value", { precision: 5, scale: 2 }),
    /** The amount off for a fixed offer. Paise, like all money here. */
    fixedPaise: bigint("fixed_paise", { mode: "number" }),
    /**
     * Ceiling on a percentage offer. Only meaningful there: a cap on a
     * fixed amount is either the same number or a smaller one pretending
     * to be the amount.
     */
    maxDiscountPaise: bigint("max_discount_paise", { mode: "number" }),
    validFrom: date("valid_from"),
    validUntil: date("valid_until"),
    /** Empty means every course / every centre. */
    courses: text("courses").array(),
    centerIds: uuid("center_ids").array(),
    /** Null means unlimited. */
    maxUses: integer("max_uses"),
    /**
     * Kept as a counter rather than counted from `enrolments` on every
     * read: "this offer has been used up" has to be answerable while
     * somebody is on the phone, and the alternative is an aggregate over
     * every admission the institute has ever taken.
     */
    usedCount: integer("used_count").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex("promos_code_uq").on(t.code).where(sql`code is not null and deleted_at is null`),
    index("promos_active_idx").on(t.isActive),
    check("promos_discount_type", sql`discount_type in ('percentage','fixed')`),
    // A promo with neither a percentage nor an amount is a discount of
    // nothing that looks like a discount.
    check("promos_has_a_value", sql`num_nonnulls(percent_value, fixed_paise) >= 1`),
    check("promos_percent_range", sql`percent_value is null or (percent_value > 0 and percent_value <= 100)`),
    check("promos_dates_ordered", sql`valid_from is null or valid_until is null or valid_until >= valid_from`),
  ],
);

/**
 * Which promo was applied to which admission.
 *
 * Its own table rather than a column on `enrolments` because the question
 * somebody actually asks is the other way round: "how many admissions did
 * Early Bird bring in, and what did it cost us?" A column would answer
 * that with a scan; this answers it with an index, and it keeps the
 * amount that was taken off at the time, which is the only figure that
 * stays true after somebody edits the promo.
 */
export const enrolmentPromos = pgTable(
  "enrolment_promos",
  {
    id: idColumn(),
    enrolmentId: uuid("enrolment_id")
      .notNull()
      .references(() => enrolments.id, { onDelete: "cascade" }),
    promoId: uuid("promo_id")
      .notNull()
      .references(() => promos.id, { onDelete: "restrict" }),
    /** What it actually took off, in paise, at the moment it was applied. */
    discountPaise: bigint("discount_paise", { mode: "number" }).notNull(),
    appliedBy: uuid("applied_by").references(() => profiles.id, { onDelete: "set null" }),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps(),
  },
  (t) => [
    // One promo per admission. Stacking offers is a decision an institute
    // should make deliberately, not one that falls out of a form being
    // saved twice.
    uniqueIndex("enrolment_promos_enrolment_uq").on(t.enrolmentId),
    index("enrolment_promos_promo_idx").on(t.promoId),
  ],
);
