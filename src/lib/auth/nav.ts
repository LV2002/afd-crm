import { formatTerm, type TerminologyMap } from "@/lib/terminology/terms";

import type { PermissionCode } from "./permissions";
import type { SessionUser } from "./session";
import { can } from "./session";

/** Keys into the ICON_MAP the (client) Sidebar component owns. */
export type NavIconKey =
  | "dashboard"
  | "my-day"
  | "leads"
  | "pipeline"
  | "accounts"
  | "finance"
  | "students"
  | "profile-forms"
  | "insights"
  | "ask"
  | "settings";

export interface NavItem {
  href: string;
  label: string;
  iconKey: NavIconKey;
  /** Omit for items every signed-in user should see (e.g. Dashboard). */
  permission?: PermissionCode;
}

interface NavItemDef {
  href: string;
  iconKey: NavIconKey;
  permission?: PermissionCode;
  /** Either a fixed screen name, or an entity word resolved via terminology. */
  label: string | { term: "lead"; form: "plural" };
}

/**
 * The sidebar is built from this list filtered by the caller's permission
 * map — never from a hardcoded role check — and every entity-named label
 * is resolved through the terminology table, never a literal string.
 *
 * Only plain, serialisable values ever reach the client Sidebar (this
 * module is imported from a Server Component): icon *components* aren't
 * serialisable across that boundary, so each item carries an iconKey
 * string instead, and labels are resolved to plain strings here, in
 * `navItemsFor`, before the array is passed as a prop.
 */
const NAV_ITEM_DEFS: NavItemDef[] = [
  { href: "/dashboard", iconKey: "dashboard", label: "Dashboard" },
  { href: "/my-day", iconKey: "my-day", permission: "lead.read", label: "My Day" },
  {
    href: "/leads",
    iconKey: "leads",
    permission: "lead.read",
    label: { term: "lead", form: "plural" },
  },
  { href: "/pipeline", iconKey: "pipeline", permission: "lead.read", label: "Pipeline" },
  { href: "/accounts", iconKey: "accounts", permission: "payment.read", label: "Accounts" },
  { href: "/students", iconKey: "students", permission: "student.read", label: "Students" },
  {
    // The institute's own money. Gated on finance.read, which a counsellor
    // does not hold — so the whole section is invisible to them, not just
    // disabled.
    href: "/finance",
    iconKey: "finance",
    permission: "finance.read",
    label: "Finance",
  },
  {
    href: "/profile-forms",
    iconKey: "profile-forms",
    permission: "lead.read",
    label: "Student Profile Forms",
  },
  { href: "/insights", iconKey: "insights", permission: "report.read", label: "Insights" },
  { href: "/ask", iconKey: "ask", permission: "ai.query", label: "Ask AI" },
  { href: "/settings", iconKey: "settings", permission: "settings.manage", label: "Settings" },
];

export function navItemsFor(user: SessionUser, terms: TerminologyMap): NavItem[] {
  return NAV_ITEM_DEFS.filter((item) => !item.permission || can(user, item.permission)).map(
    (item) => ({
      href: item.href,
      iconKey: item.iconKey,
      permission: item.permission,
      label:
        typeof item.label === "string" ? item.label : formatTerm(terms, item.label.term, item.label.form),
    }),
  );
}
