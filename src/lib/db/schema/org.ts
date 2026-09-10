import { boolean, integer, jsonb, numeric, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";

/** Singleton row — the seed script inserts exactly one. */
export const orgSettings = pgTable("org_settings", {
  id: idColumn(),
  name: text("name").notNull(),
  /**
   * The name that goes on a contract, when it differs from the name on
   * the sign. "AFD India" is who a family talks to; the entity that takes
   * their money may be something longer with a Pvt Ltd on the end, and
   * putting the trading name on an agreement is the sort of thing that
   * matters exactly once, in a dispute.
   */
  legalName: text("legal_name"),
  /** The line under the logo. Was hardcoded into the fee agreement. */
  tagline: text("tagline"),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").notNull().default("#0f172a"),

  /**
   * The letterhead block.
   *
   * None of this existed, which is why every printed document either had
   * no contact details or had a set typed into the source code. A receipt
   * with no address is not a receipt anybody would accept.
   */
  addressLine: text("address_line"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  /** Printed on fee documents where it belongs, omitted entirely when blank. */
  gstin: text("gstin"),
  /** A last line for documents — terms reference, refund policy pointer, anything. */
  documentFooter: text("document_footer"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  currency: text("currency").notNull().default("INR"),
  locale: text("locale").notNull().default("en-IN"),
  fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(4),
  /**
   * GST applied to (course fee − discounts), as a fraction: 0.18 is 18%.
   * `numeric` rather than a float — a rate that drifts by 1e-16 changes a
   * printed total on a fee agreement.
   *
   * Configuration, not a constant, because it is a rate a government
   * changes and an institute's CA has an opinion about. The finance
   * reports treat it as a memo only: they back-calculate the GST inside
   * gross collections. Nothing here is a return, and nothing here tracks
   * input credit or what has actually been remitted.
   */
  gstRate: numeric("gst_rate", { precision: 6, scale: 4 }).notNull().default("0.18"),
  dateFormat: text("date_format").notNull().default("dd/MM/yyyy"),
  /** docs/01-DATA-MODEL.md § Temperature: how long a counsellor's manual temperature override beats the recompute cron. */
  temperatureOverrideDays: integer("temperature_override_days").notNull().default(3),
  ...timestamps(),
});

/**
 * key='lead' -> singular/plural label for a different company's vocabulary.
 * UI reads through a t() helper, never a hardcoded string.
 */
export const terminology = pgTable("terminology", {
  id: idColumn(),
  key: text("key").notNull().unique(),
  singular: text("singular").notNull(),
  plural: text("plural").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

export const centers = pgTable(
  "centers",
  {
    id: idColumn(),
    name: text("name").notNull(),
    city: text("city").notNull(),
    address: text("address"),
    /**
     * Per-centre contact, for documents issued by that centre. A receipt
     * printed at Kannur showing Kochi's phone number sends the person who
     * has a question about it to the wrong office.
     */
    phone: text("phone"),
    email: text("email"),
    isActive: boolean("is_active").notNull().default(true),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    catchment: jsonb("catchment").$type<{ districts?: string[] }>(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [uniqueIndex("centers_name_uq").on(t.name)],
);
