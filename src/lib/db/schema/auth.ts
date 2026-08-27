import {
  boolean,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers, idColumn, timestamps } from "./_helpers";
import { centers } from "./org";

export const permissionScopeEnum = pgEnum("permission_scope", [
  "own",
  "center",
  "all",
]);

/**
 * Permission primitives. Rows are seeded from the constant in
 * src/lib/auth/permissions.ts, which is the source of truth — this table
 * is a mirror the database (and RLS policies) can join against.
 */
export const permissions = pgTable("permissions", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
});

export const roles = pgTable("roles", {
  id: idColumn(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  /** Cannot be deleted or stripped of permissions. Exactly one: admin. */
  isProtected: boolean("is_protected").notNull().default(false),
  ...timestamps(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionCode: text("permission_code")
      .notNull()
      .references(() => permissions.code, { onDelete: "cascade" }),
    scope: permissionScopeEnum("scope").notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionCode] })],
);

/** Extends auth.users. id is the same uuid as the Supabase auth user. */
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "restrict" }),
  isActive: boolean("is_active").notNull().default(true),
  whatsappDisplayName: text("whatsapp_display_name"),
  avatarUrl: text("avatar_url"),
  ...timestamps(),
});

export const userCenters = pgTable(
  "user_centers",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    centerId: uuid("center_id")
      .notNull()
      .references(() => centers.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.centerId] })],
);
