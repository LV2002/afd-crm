import type { PermissionCode } from "@/lib/auth/permissions";
import { DASHBOARD_WIDGETS, type WidgetDefinition } from "@/lib/dashboard/widgets";

/**
 * Which widgets a person sees, in what order.
 *
 * Two inputs, and the precedence between them is the whole design:
 *
 * 1. **What their permissions allow.** A hard floor. An admin composing a
 *    role's dashboard can hide a widget but cannot grant one — a widget
 *    without the permission behind it draws a card of zeroes, which is a
 *    worse lie than an absent card.
 *
 * 2. **What the admin arranged for their role.** Ordering and visibility,
 *    from `dashboard_layouts`.
 *
 * A role with no rows at all falls through to "everything they are allowed,
 * in registry order" — which is exactly what the dashboard did before it
 * was configurable, so an untouched instance behaves identically and an
 * admin who has never opened the screen has nothing to discover.
 */

export interface LayoutRow {
  widgetKey: string;
  sortOrder: number;
  isVisible: boolean;
}

export interface WidgetPermissionCheck {
  /** Does the caller hold this permission at any scope? */
  has: (permission: PermissionCode) => boolean;
  /** The caller's scope for a permission, for widgets that need a specific one. */
  scope: (permission: PermissionCode) => "own" | "center" | "all" | undefined;
}

export function allowsWidget(widget: WidgetDefinition, check: WidgetPermissionCheck): boolean {
  if (!check.has(widget.permission)) return false;
  if (widget.requireScope && check.scope(widget.permission) !== widget.requireScope) return false;
  return true;
}

export function resolveDashboard(
  layout: LayoutRow[],
  check: WidgetPermissionCheck,
): WidgetDefinition[] {
  const permitted = DASHBOARD_WIDGETS.filter((widget) => allowsWidget(widget, check));
  if (layout.length === 0) return permitted;

  const configured = new Map(layout.map((row) => [row.widgetKey, row]));

  return permitted
    .filter((widget) => configured.get(widget.key)?.isVisible ?? true)
    .sort((a, b) => {
      // A widget with no row keeps its registry position relative to the
      // arranged ones. Adding a widget to the codebase must not require
      // every existing role's layout to be edited before anybody sees it.
      const orderA = configured.get(a.key)?.sortOrder ?? DASHBOARD_WIDGETS.indexOf(a);
      const orderB = configured.get(b.key)?.sortOrder ?? DASHBOARD_WIDGETS.indexOf(b);
      if (orderA !== orderB) return orderA - orderB;
      return DASHBOARD_WIDGETS.indexOf(a) - DASHBOARD_WIDGETS.indexOf(b);
    });
}
