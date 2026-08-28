/**
 * Single source of truth for permission primitives.
 *
 * Every row seeded into the `permissions` table comes from this list, and
 * every RLS policy / server-side guard should reference a `PermissionCode`
 * from here — never a raw string, never a role name.
 *
 * Adding a code here without a real enforcement point somewhere in the
 * codebase does nothing. Do not add "for later."
 */

export const PERMISSION_SCOPES = ["own", "center", "all"] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

export const PERMISSION_CATEGORIES = [
  "Leads",
  "Interactions",
  "WhatsApp",
  "Enrolment",
  "Payments",
  "Academics",
  "Reports",
  "Administration",
] as const;
export type PermissionCategory = (typeof PERMISSION_CATEGORIES)[number];

export interface PermissionDefinition {
  code: string;
  label: string;
  category: PermissionCategory;
  description: string;
}

export const PERMISSIONS = [
  // Leads
  {
    code: "lead.read",
    label: "View leads",
    category: "Leads",
    description: "See lead records, scoped to own/center/all.",
  },
  {
    code: "lead.create",
    label: "Create leads",
    category: "Leads",
    description: "Manually create a new lead.",
  },
  {
    code: "lead.update",
    label: "Edit leads",
    category: "Leads",
    description: "Edit lead fields, change stage and temperature.",
  },
  {
    code: "lead.delete",
    label: "Delete leads",
    category: "Leads",
    description: "Soft-delete a lead (sets deleted_at).",
  },
  {
    code: "lead.assign",
    label: "Assign leads",
    category: "Leads",
    description: "Change a lead's owner or center.",
  },
  {
    code: "lead.merge",
    label: "Merge leads",
    category: "Leads",
    description: "Merge a duplicate lead into a survivor record.",
  },
  {
    code: "lead.export",
    label: "Export leads",
    category: "Leads",
    description: "Export lead lists to CSV/XLSX. Always audited.",
  },
  {
    code: "lead.reveal_phone",
    label: "Reveal phone numbers",
    category: "Leads",
    description: "See a full, unmasked phone number. Always audited.",
  },
  {
    code: "lead.import",
    label: "Import leads",
    category: "Leads",
    description: "Bulk import leads via CSV/XLSX.",
  },

  // Interactions
  {
    code: "interaction.read",
    label: "View interactions",
    category: "Interactions",
    description: "See call/WhatsApp/note history on a lead.",
  },
  {
    code: "interaction.create",
    label: "Log interactions",
    category: "Interactions",
    description: "Log a call, note or other interaction on a lead.",
  },

  // WhatsApp
  {
    code: "whatsapp.read",
    label: "View WhatsApp threads",
    category: "WhatsApp",
    description: "Read WhatsApp conversation history for a lead.",
  },
  {
    code: "whatsapp.send",
    label: "Send WhatsApp messages",
    category: "WhatsApp",
    description: "Send an outbound WhatsApp message to a lead.",
  },
  {
    code: "whatsapp.campaign",
    label: "Run WhatsApp campaigns",
    category: "WhatsApp",
    description: "Build and send a bulk WhatsApp campaign.",
  },

  // Enrolment
  {
    code: "enrolment.read",
    label: "View enrolments",
    category: "Enrolment",
    description: "See enrolment/fee records.",
  },
  {
    code: "enrolment.create",
    label: "Create enrolments",
    category: "Enrolment",
    description: "Confirm an admission and create an enrolment.",
  },
  {
    code: "enrolment.update",
    label: "Edit enrolments",
    category: "Enrolment",
    description: "Edit an enrolment's course, batch or fee plan.",
  },

  // Payments
  {
    code: "payment.read",
    label: "View payments",
    category: "Payments",
    description: "See the payment ledger for an enrolment.",
  },
  {
    code: "payment.record",
    label: "Record payments",
    category: "Payments",
    description: "Record an incoming payment against an installment.",
  },
  {
    code: "payment.refund",
    label: "Process refunds",
    category: "Payments",
    description: "Record a refund as a reversal entry.",
  },
  {
    code: "discount.approve",
    label: "Approve discounts",
    category: "Payments",
    description: "Approve a discount request beyond a counsellor's authority limit.",
  },

  // Academics
  {
    code: "student.read",
    label: "View students",
    category: "Academics",
    description: "See the academics record created at the accounts→academics gate.",
  },
  {
    code: "student.update",
    label: "Edit students",
    category: "Academics",
    description: "Edit a student's academic record.",
  },
  {
    code: "batch.manage",
    label: "Manage batches",
    category: "Academics",
    description: "Create batches and assign students to them.",
  },

  // Reports
  {
    code: "report.read",
    label: "View own reports",
    category: "Reports",
    description: "See reports scoped to the caller's own leads.",
  },
  {
    code: "report.center",
    label: "View center reports",
    category: "Reports",
    description: "See reports scoped to the caller's centers.",
  },
  {
    code: "report.org",
    label: "View org-wide reports",
    category: "Reports",
    description: "See reports across every center.",
  },
  {
    code: "ai.query",
    label: "Use AI analyst",
    category: "Reports",
    description: "Ask the /ask AI analyst questions over scoped data.",
  },

  // Administration
  {
    code: "settings.manage",
    label: "Manage settings",
    category: "Administration",
    description: "Edit org settings, terminology, centers, pipeline, dropdowns, fields.",
  },
  {
    code: "users.manage",
    label: "Manage users",
    category: "Administration",
    description: "Create/deactivate users, assign roles and centers.",
  },
  {
    code: "roles.manage",
    label: "Manage roles",
    category: "Administration",
    description: "Create/edit/delete roles and their permission bundles.",
  },
  {
    code: "rules.manage",
    label: "Manage rules",
    category: "Administration",
    description: "Edit assignment rules, SLA policies, temperature rules, scoring.",
  },
  {
    code: "config.export",
    label: "Export configuration",
    category: "Administration",
    description: "Export the config bundle for the plug-and-play test.",
  },
  {
    code: "config.import",
    label: "Import configuration",
    category: "Administration",
    description: "Import a config bundle into a fresh instance. Refuses to run on one that already has data.",
  },
  {
    code: "audit.read",
    label: "View audit log",
    category: "Administration",
    description: "Read the audit log.",
  },
] as const satisfies readonly PermissionDefinition[];

export type PermissionCode = (typeof PERMISSIONS)[number]["code"];

export const PERMISSION_CODES: readonly PermissionCode[] = PERMISSIONS.map(
  (p) => p.code,
);

export function isPermissionCode(value: string): value is PermissionCode {
  return (PERMISSION_CODES as readonly string[]).includes(value);
}
