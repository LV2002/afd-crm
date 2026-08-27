import {
  BarChart3,
  KanbanSquare,
  LayoutDashboard,
  Settings,
  Sparkles,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { PermissionCode } from "./permissions";
import type { SessionUser } from "./session";
import { can } from "./session";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Omit for items every signed-in user should see (e.g. Dashboard). */
  permission?: PermissionCode;
}

/**
 * The sidebar is built from this list filtered by the caller's permission
 * map — never from a hardcoded role check. A brand new role automatically
 * gets the right nav the moment it holds the matching permission.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/my-day", label: "My Day", icon: Sun, permission: "lead.read" },
  { href: "/leads", label: "Leads", icon: Users, permission: "lead.read" },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare, permission: "lead.read" },
  { href: "/reports", label: "Reports", icon: BarChart3, permission: "report.read" },
  { href: "/ask", label: "Ask AI", icon: Sparkles, permission: "ai.query" },
  { href: "/settings", label: "Settings", icon: Settings, permission: "settings.manage" },
];

export function navItemsFor(user: SessionUser): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.permission || can(user, item.permission));
}
