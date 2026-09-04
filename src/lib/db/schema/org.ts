import { boolean, integer, jsonb, numeric, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { idColumn, softDelete, timestamps } from "./_helpers";

/** Singleton row — the seed script inserts exactly one. */
export const orgSettings = pgTable("org_settings", {
  id: idColumn(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").notNull().default("#0f172a"),
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
    isActive: boolean("is_active").notNull().default(true),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    catchment: jsonb("catchment").$type<{ districts?: string[] }>(),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [uniqueIndex("centers_name_uq").on(t.name)],
);
