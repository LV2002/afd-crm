import type { NavBadgeKey } from "@/lib/nav/badge-permissions";
import { formatTerm, type TerminologyMap } from "@/lib/terminology/terms";

import { settingsNavFor } from "@/lib/settings/nav";

import type { PermissionCode } from "./permissions";
import type { SessionUser } from "./session";
import { can } from "./session";

/** Keys into the ICON_MAP the (client) Sidebar component owns. */
export type NavIconKey =
  | "dashboard"
  | "leads"
  | "follow-ups"
  | "orphans"
  | "database"
  | "accounts"
  | "finance"
  | "students"
  | "whatsapp"
  | "profile-forms"
  | "insights"
  | "marketing"
  | "ask"
  | "hr-me"
  | "hr-people"
  | "settings";

import type { NavGroup } from "./nav-groups";

export type { NavGroup };

export interface NavItem {
  href: string;
  label: string;
  group?: NavGroup;
  iconKey: NavIconKey;
  /** Omit for items every signed-in user should see (e.g. Dashboard). */
  permission?: PermissionCode;
  /**
   * Which work-queue count to show in red beside this item, if any. Only
   * the four screens that are genuinely queues have one — a badge on
   * Insights or Settings would be a number nobody can work down.
   */
  badgeKey?: NavBadgeKey;
  /** What the count is, in words, for the badge's accessible label. */
  badgeWhat?: string;
}

interface NavItemDef {
  href: string;
  group?: NavGroup;
  iconKey: NavIconKey;
  permission?: PermissionCode;
  badgeKey?: NavBadgeKey;
  badgeWhat?: string;
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
  {
    href: "/leads",
    group: "sales",
    iconKey: "leads",
    permission: "lead.read",
    label: { term: "lead", form: "plural" },
  },
  /*
    Follow-ups took the Pipeline board's place.

    The board answered "where is everybody in the funnel" — a question
    asked occasionally, by a manager. What a counsellor opens a CRM to
    ask is "who am I behind on", and the board answered that worst of
    all. The badge is the overdue count, because the whole value of this
    entry is being able to see from any screen that you are behind.
  */
  {
    href: "/follow-ups",
    group: "sales",
    iconKey: "follow-ups",
    permission: "lead.read",
    badgeKey: "followUps",
    badgeWhat: "follow-ups overdue",
    label: "Follow-ups",
  },
  // The unassigned pile. It had a screen from Phase 2 and no way to reach
  // it but by typing the URL, which for a queue whose entire job is "these
  // are being forgotten" is close to not having it. Gated on lead.assign,
  // so only the people who can actually claim one see it.
  {
    href: "/leads/orphans",
    group: "sales",
    iconKey: "orphans",
    permission: "lead.assign",
    badgeKey: "unassigned",
    badgeWhat: "leads waiting to be assigned",
    label: "Unassigned",
  },
  {
    // People we hold details for who are not leads: seminar attendees,
    // purchased lists. Visible to anyone who can read the database.
    href: "/database",
    group: "sales",
    iconKey: "database",
    permission: "contact.read",
    label: "Database",
  },
  {
    // "Chats", not "WhatsApp", because the section now holds more than
    // one channel — the Business API inbox, and the places the other
    // conversations will live. The route stays /whatsapp: renaming it
    // would break every bookmark and every link already sent round, and
    // buys nothing a label does not.
    href: "/whatsapp",
    group: "sales",
    iconKey: "whatsapp",
    permission: "whatsapp.read",
    badgeKey: "whatsapp",
    badgeWhat: "conversations waiting for a reply",
    label: "Chats",
  },
  {
    // "Admissions", not "Accounts": this is the per-student fee-collection
    // queue, and the moment a Finance section existed the old name read as
    // "the accounting area" — which is the other one.
    href: "/accounts",
    group: "accounts",
    iconKey: "accounts",
    permission: "payment.read",
    // Confirmed by a counsellor, not yet paid. This is the signal accounts
    // had no way to get: an admission was confirmed and the only way to
    // find out was to open the screen and look.
    badgeKey: "admissions",
    badgeWhat: "admissions awaiting a first payment",
    label: "Admissions",
  },
  {
    // The institute's own money. Gated on finance.read, which a counsellor
    // does not hold — so the whole section is invisible to them, not just
    // disabled.
    href: "/finance",
    group: "accounts",
    iconKey: "finance",
    permission: "finance.read",
    label: "Finance",
  },
  {
    /*
      Gated on the permission the screen actually needs.

      It used to be `report.read`, which every counsellor holds, so the
      entry appeared for everybody and the page then turned most of them
      away — a tab whose only function, for four of the six seeded roles,
      was to refuse them. Now the link and the screen agree, and an admin
      who unticks "View ad performance" for a role removes both.
    */
    href: "/marketing",
    group: "marketing",
    iconKey: "marketing",
    permission: "report.ads",
    label: "Ad Performance",
  },
  {
    href: "/students",
    group: "academics",
    iconKey: "students",
    permission: "student.read",
    badgeKey: "onboarding",
    badgeWhat: "students waiting to be onboarded",
    label: "Students",
  },
  {
    // Everybody with a login: their own leave, holidays and payslips.
    href: "/hr/me",
    group: "hr",
    iconKey: "hr-me",
    permission: "hr.self",
    label: "My HR",
  },
  {
    href: "/hr/employees",
    group: "hr",
    iconKey: "hr-people",
    permission: "hr.read",
    label: "Employees",
  },
  {
    href: "/hr/leave",
    group: "hr",
    iconKey: "hr-people",
    permission: "hr.read",
    label: "Leave",
  },
  {
    href: "/profile-forms",
    iconKey: "profile-forms",
    permission: "lead.read",
    // A student filling in their profile form is a thing the office should
    // find out about without being told twice. The count is the ones
    // nobody has read yet.
    badgeKey: "profileForms",
    badgeWhat: "profile forms nobody has read",
    label: "Student Profile Forms",
  },
  { href: "/insights", iconKey: "insights", permission: "report.read", label: "Insights" },
  { href: "/ask", iconKey: "ask", permission: "ai.query", label: "Ask AI" },
  { href: "/settings", iconKey: "settings", permission: "settings.manage", label: "Settings" },
];

export function navItemsFor(user: SessionUser, terms: TerminologyMap): NavItem[] {
  return NAV_ITEM_DEFS.filter((item) => {
    // Settings is a menu of screens, each with its own permission. Gating the
    // tab on `settings.manage` hid it from a role that was given only SLA,
    // targets or discount authority, so they held the key and never saw the door.
    if (item.href === "/settings") return settingsNavFor(user).length > 0;
    return !item.permission || can(user, item.permission);
  }).map(
    (item) => ({
      href: item.href,
      group: item.group,
      iconKey: item.iconKey,
      permission: item.permission,
      badgeKey: item.badgeKey,
      badgeWhat: item.badgeWhat,
      label:
        typeof item.label === "string"
          ? item.label
          : formatTerm(terms, item.label.term, item.label.form),
    }),
  );
}
