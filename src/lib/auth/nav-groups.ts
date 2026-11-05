/**
 * The departments the sidebar is grouped into. Its own file, with nothing
 * server-side in it, because the sidebar and the mobile menu are client
 * components and importing a value from `nav.ts` would drag the session code
 * (which is server-only) into the browser bundle.
 */
export type NavGroup = "sales" | "accounts" | "marketing" | "academics" | "hr";

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  sales: "Sales",
  accounts: "Accounts",
  marketing: "Marketing",
  academics: "Academics",
  hr: "HR",
};
