import { pgSchema, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Reference-only view of Supabase's `auth.users` table so profiles.id can
 * carry a real FK. Supabase owns and migrates this table; Drizzle never
 * creates or alters it.
 */
export const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

/** Standard id + created_at/updated_at columns shared by most tables. */
export function timestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  };
}

export function softDelete() {
  return {
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  };
}

export function idColumn() {
  return uuid("id").primaryKey().defaultRandom();
}
