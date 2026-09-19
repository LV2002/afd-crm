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
  "Finance",
  "Academics",
  "Files",
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
  // Deliberately separate from enrolment.update. Marking an admission
  // dropped removes it from the conversion numbers and stops the fee
  // being chased, so it is not the same authority as correcting a fee.
  // Not granted to counsellors out of the box — a counsellor should not
  // be able to quietly retire their own conversion — but roles are
  // ordinary editable rows, so an institute that disagrees can change it.
  {
    code: "enrolment.drop",
    label: "Mark admissions dropped",
    category: "Enrolment",
    description:
      "Record that a student left the course, and restore one marked dropped by mistake.",
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

  // Finance
  //
  // Separate from `payment.*` on purpose. Those are about ONE student's
  // fees — a counsellor can see what a lead has paid. These are about the
  // institute's own money: bank and cash balances, salaries, rent, ad
  // spend, the profit and loss. A counsellor has no business in it, and
  // the split is what lets an admin grant one without the other.
  {
    code: "finance.read",
    label: "View finance",
    category: "Finance",
    description: "See account balances, the cash ledger and the finance reports.",
  },
  {
    code: "finance.record",
    label: "Record finance entries",
    category: "Finance",
    description: "Post an expense, other income, or a transfer between accounts.",
  },
  {
    code: "finance.manage",
    label: "Manage finance setup",
    category: "Finance",
    description:
      "Add and edit accounts and opening balances, and reverse or correct a posted entry.",
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
  // Split from batch.manage on purpose. A centre head manages who is in
  // which batch at their own centre; the syllabus is one institute-wide
  // document and is the academic coordinator's to write. The read half is
  // separate again because a faculty member needs to see what they are
  // meant to teach without being able to rewrite it.
  // Faculty are a separate record from users on purpose (see
  // schema/faculty.ts): a visiting teacher gets a name and a subject in
  // ten seconds, and a login only if they ever need one. Managing that
  // list is the coordinator's job, so it is not folded into users.manage.
  {
    code: "faculty.read",
    label: "View faculty",
    category: "Academics",
    description: "See the teaching staff list, what each teaches, and when they are free.",
  },
  {
    code: "faculty.manage",
    label: "Manage faculty",
    category: "Academics",
    description:
      "Add and edit teaching staff, their subjects, centres, availability and leave.",
  },
  {
    code: "curriculum.read",
    label: "View the syllabus",
    category: "Academics",
    description: "See the modules, topics and per-course teaching plans.",
  },
  {
    code: "curriculum.manage",
    label: "Edit the syllabus",
    category: "Academics",
    description:
      "Add and edit modules, topics, and each course's hours and coverage notes.",
  },

  // Files
  {
    code: "file.read",
    label: "View files",
    category: "Files",
    description: "Open documents attached to a lead or student.",
  },
  {
    code: "file.upload",
    label: "Upload files",
    category: "Files",
    description: "Attach documents to a lead or student.",
  },
  {
    code: "file.delete",
    label: "Remove files",
    category: "Files",
    description: "Remove an attached document. The file is soft-deleted, never destroyed.",
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
  // Separate from settings.manage on purpose. A centre head should be
  // able to set their centre's number for the month — and their people's
  // numbers — without also holding the keys to the pipeline, the roles
  // and the integrations. Enforced in the targets RLS policies and in the
  // Settings → Targets screen.
  {
    code: "target.manage",
    label: "Set targets",
    category: "Reports",
    description: "Set the monthly lead, admission and revenue targets a report is measured against.",
  },
  // Seeded to admin and co-admin only. The analyst can pull one person's
  // whole file — profile, fee plan, payments, whether they are still
  // studying — and those tools refuse anybody without org-wide report
  // access, so granting this to a narrower role would produce a menu item
  // that exists to say no. Still an ordinary editable grant.
  {
    code: "ai.query",
    label: "Use AI analyst",
    category: "Reports",
    description:
      "Ask the /ask AI analyst questions, including the full history of one named lead or student.",
  },

  // Administration
  {
    code: "settings.manage",
    label: "Manage settings",
    category: "Administration",
    description: "Edit org settings, terminology, centers, pipeline, dropdowns, fields.",
  },
  // Deliberately narrower than users.manage, which a centre head holds for
  // their own centres. Setting somebody else's password is the one action
  // here that hands over an identity rather than editing a record about
  // one, so it ships granted to `admin` alone — including not to co-admin,
  // which otherwise holds everything. It is still an ordinary editable
  // grant: an institute that wants its deputy to do this turns it on in
  // Settings → Roles.
  {
    code: "user.reset_password",
    label: "Reset passwords",
    category: "Administration",
    description: "Set a new password for another user's account. Always audited.",
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
