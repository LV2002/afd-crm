import { boolean, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";

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
  dateFormat: text("date_format").notNull().default("dd/MM/yyyy"),
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

export const centers = pgTable("centers", {
  id: idColumn(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  address: text("address"),
  isActive: boolean("is_active").notNull().default(true),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  catchment: jsonb("catchment").$type<{ districts?: string[] }>(),
  ...timestamps(),
  ...softDelete(),
});
