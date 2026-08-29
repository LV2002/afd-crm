import type { PermissionCode } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/session";

export interface SettingsNavItem {
  href: string;
  label: string;
  description: string;
  /** Visible if the caller holds ANY permission in this list. */
  permissions: PermissionCode[];
}

/**
 * Each settings screen is gated on the specific permission its mutations
 * actually need at the RLS layer (settings.manage / users.manage /
 * roles.manage / rules.manage) — not a single blanket permission — so a
 * role that holds e.g. only users.manage still sees the Users screen.
 */
export const SETTINGS_NAV: SettingsNavItem[] = [
  {
    href: "/settings/organization",
    label: "Organisation",
    description: "Name, logo, colours, timezone, currency, locale",
    permissions: ["settings.manage"],
  },
  {
    href: "/settings/terminology",
    label: "Terminology",
    description: "Rename lead / student / counsellor / centre / course / exam",
    permissions: ["settings.manage"],
  },
  {
    href: "/settings/centers",
    label: "Centres",
    description: "Create, edit, deactivate, assign users",
    permissions: ["settings.manage"],
  },
  {
    href: "/settings/users",
    label: "Users",
    description: "Create, deactivate, assign role and centres",
    permissions: ["users.manage"],
  },
  {
    href: "/settings/roles",
    label: "Roles & Permissions",
    description: "Create a role, edit its permission bundle",
    permissions: ["roles.manage"],
  },
  {
    href: "/settings/pipeline-stages",
    label: "Pipeline Stages",
    description: "Add, reorder, colour, type, probability, SLA hours",
    permissions: ["settings.manage"],
  },
  {
    href: "/settings/temperatures",
    label: "Temperatures",
    description: "Values, colours, order, and the rules that assign them",
    permissions: ["settings.manage", "rules.manage"],
  },
  {
    href: "/settings/sla",
    label: "SLA Policies",
    description: "Policies, escalation ladders, business hours and holidays",
    permissions: ["rules.manage"],
  },
  {
    href: "/settings/fee-structures",
    label: "Fee Structures",
    description: "Base fee by course, centre, mode and academic year",
    permissions: ["settings.manage"],
  },
  {
    href: "/settings/tags",
    label: "Tags",
    description: "Labels a lead can carry, for segmentation and retargeting audiences",
    permissions: ["settings.manage"],
  },
  {
    href: "/settings/dropdowns",
    label: "Dropdowns",
    description: "Manage categories and options",
    permissions: ["settings.manage"],
  },
  {
    href: "/settings/fields",
    label: "Custom Fields",
    description: "Add fields to lead / student / enrolment",
    permissions: ["settings.manage"],
  },
  {
    href: "/settings/config",
    label: "Config Export/Import",
    description: "Export configuration as a bundle, or bootstrap a fresh instance from one",
    permissions: ["config.export", "config.import"],
  },
  {
    href: "/settings/integrations",
    label: "Integrations",
    description: "Connect Meta, Google, WhatsApp and telephony — plug in credentials, no deploy",
    permissions: ["settings.manage"],
  },
  {
    href: "/settings/whatsapp-broadcasts",
    label: "WhatsApp Broadcasts",
    description: "Send a template message to every lead carrying a tag",
    permissions: ["whatsapp.campaign"],
  },
];

export function settingsNavFor(user: SessionUser): SettingsNavItem[] {
  return SETTINGS_NAV.filter((item) => item.permissions.some((p) => can(user, p)));
}
