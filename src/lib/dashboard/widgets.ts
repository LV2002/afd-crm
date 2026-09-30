import type { PermissionCode } from "@/lib/auth/permissions";

/**
 * The dashboard widgets this system knows how to draw.
 *
 * CLAUDE.md draws the line here explicitly: widget *implementations* are
 * fixed in code — "admin composes them; doesn't author new ones" — while
 * *which registered widgets appear for which role* is configuration. So
 * this registry is the fixed half: a stable key, a name an admin will
 * recognise, and the permission the widget's data actually needs.
 *
 * A widget's `permission` is not decoration. Every widget reads through
 * the RLS-bound client, so granting a role a widget it has no permission
 * for would produce a card of zeroes rather than an error — worse than
 * not showing it, because zero is a number somebody might believe. The
 * resolver therefore treats permission as a hard floor that an admin's
 * layout can subtract from but never add to.
 */

export interface WidgetDefinition {
  key: string;
  name: string;
  description: string;
  /** Without this, the widget's own queries would return nothing. */
  permission: PermissionCode;
  /**
   * Some widgets only make sense at one scope. "Your day" lists the leads
   * assigned to *you*: at centre or institute scope it is a card of zeroes,
   * because nothing is ever assigned to an admin directly.
   */
  requireScope?: "own";
}

export const DASHBOARD_WIDGETS: WidgetDefinition[] = [
  {
    key: "my_numbers",
    name: "Your numbers",
    description:
      "Leads assigned today, this month's new leads and admissions, and the running admission rate.",
    permission: "lead.read",
  },
  {
    // No `requireScope: "own"` any more. It used to be here on the grounds
    // that nothing is assigned to a centre head directly — which is wrong:
    // heads carry their own leads, and Leon asked for their day too. The
    // query filters on `assigned_to = me`, so it is correct at any scope,
    // and an admin with nothing assigned is handled by hiding the widget in
    // their layout rather than by a rule in code.
    key: "my_day",
    name: "Your day",
    description: "The work queue: overdue, due today, new and at-risk leads assigned to you.",
    permission: "lead.read",
  },
  {
    key: "centre",
    name: "Centre pipeline",
    description: "New leads this month, what is in the funnel, SLA breaches, admissions.",
    permission: "lead.assign",
  },
  {
    // `report.center` rather than `lead.assign`: this card is one person's
    // numbers shown to another person, which is a reporting act. A
    // counsellor holds `report.read` at `own` and so never sees it.
    key: "centre_team",
    name: "Counsellor performance",
    description: "Each counsellor's active leads, new leads, admissions and overdue follow-ups.",
    permission: "report.center",
  },
  {
    key: "accounts",
    name: "Accounts",
    description: "Waiting for a first payment, collected this month, overdue instalments.",
    permission: "payment.read",
  },
  {
    key: "academics",
    name: "Academics",
    description: "Students, batches, and who has not been placed in one yet.",
    permission: "student.read",
  },
  {
    key: "admin",
    name: "Administration",
    description: "Users, centres, integration health and anything that has broken.",
    permission: "settings.manage",
  },
];

export const WIDGET_KEYS = DASHBOARD_WIDGETS.map((widget) => widget.key);

export function widgetByKey(key: string): WidgetDefinition | undefined {
  return DASHBOARD_WIDGETS.find((widget) => widget.key === key);
}
