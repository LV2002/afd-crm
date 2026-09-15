import { boolean, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { idColumn, timestamps } from "./_helpers";
import { roles } from "./auth";

/**
 * Which dashboard widgets a role sees, and in what order.
 *
 * CLAUDE.md puts the line here deliberately: widget implementations are
 * fixed in code ("admin composes them; doesn't author new ones"), while
 * which widget appears for which role is configuration. This table is the
 * configurable half — named in docs/01-DATA-MODEL.md from the start and
 * never built, so the dashboard branched on hardcoded permission checks
 * and an admin who wanted the accounts team to stop seeing the pipeline
 * card had nowhere to say so.
 *
 * A role with no rows here is not a role with an empty dashboard: the
 * resolver falls back to every widget the role's permissions allow, which
 * is what the screen did before it was configurable. Absence means "not
 * arranged", never "hidden".
 *
 * `widget_key` is a plain text key into the code registry rather than a
 * foreign key to a widgets table, because the registry genuinely lives in
 * code. A key that no longer exists is ignored by the resolver, so
 * removing a widget from the codebase cannot break somebody's dashboard.
 */
export const dashboardLayouts = pgTable(
  "dashboard_layouts",
  {
    id: idColumn(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    /** Matches a key in lib/dashboard/widgets.ts. */
    widgetKey: text("widget_key").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isVisible: boolean("is_visible").notNull().default(true),
    ...timestamps(),
  },
  (table) => [unique("dashboard_layouts_role_widget_uq").on(table.roleId, table.widgetKey)],
);
