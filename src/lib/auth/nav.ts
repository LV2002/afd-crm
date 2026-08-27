import type { PermissionCode } from "./permissions";
import type { SessionUser } from "./session";
import { can } from "./session";

/** Keys into the ICON_MAP the (client) Sidebar component owns. */
export type NavIconKey =
  | "dashboard"
  | "my-day"
  | "leads"
  | "pipeline"
  | "reports"
  | "ask"
  | "settings";

export interface NavItem {
  href: string;
  label: string;
  iconKey: NavIconKey;
  /** Omit for items every signed-in user should see (e.g. Dashboard). */
  permission?: PermissionCode;
}

/**
 * The sidebar is built from this list filtered by the caller's permission
 * map — never from a hardcoded role check. A brand new role automatically
 * gets the right nav the moment it holds the matching permission.
 *
 * Only plain, serialisable values live here (this module is imported from
 * a Server Component and passed as props into the client Sidebar) — icon
 * *components* are not serialisable across that boundary, so each item
 * carries an iconKey string instead and the Sidebar resolves it locally.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", iconKey: "dashboard" },
  { href: "/my-day", label: "My Day", iconKey: "my-day", permission: "lead.read" },
  { href: "/leads", label: "Leads", iconKey: "leads", permission: "lead.read" },
  { href: "/pipeline", label: "Pipeline", iconKey: "pipeline", permission: "lead.read" },
  { href: "/reports", label: "Reports", iconKey: "reports", permission: "report.read" },
  { href: "/ask", label: "Ask AI", iconKey: "ask", permission: "ai.query" },
  { href: "/settings", label: "Settings", iconKey: "settings", permission: "settings.manage" },
];

export function navItemsFor(user: SessionUser): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.permission || can(user, item.permission));
}
