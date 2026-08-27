import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { idColumn } from "./_helpers";
import { profiles } from "./auth";

/**
 * Append-only. No update or delete policy exists for any role — enforced in
 * RLS, not convention. Every mutation and every export writes here,
 * including phone-number reveals.
 */
export const auditLog = pgTable("audit_log", {
  id: idColumn(),
  actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  before: jsonb("before").$type<Record<string, unknown>>(),
  after: jsonb("after").$type<Record<string, unknown>>(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});
