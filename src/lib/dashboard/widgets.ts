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
  /**
   * How much of the dashboard's width this widget wants.
   *
   * The grid is two columns from `lg` up and every widget took one of
   * them, which is right for a card of four numbers and wrong for a card
   * of eight: the pipeline widget's two rows of four tiles were squeezed
   * into half a page while the funnel they describe is the widest thing
   * on the screen. A widget says what it needs here rather than setting
   * its own column span, so the dashboard keeps deciding the layout and
   * one place lists which widgets are wide.
   *
   * Nothing changes below `lg`, where the grid is a single column
   * regardless.
   */
  width?: "half" | "full";
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
    // Eight figures in two rows of four. At half width the tiles wrap to
    // two columns and the card becomes a tall narrow ladder of numbers
    // next to a short one, which is what "disproportionate" meant.
    width: "full",
  },
  {
    // `report.center` rather than `lead.assign`: this card is one person's
    // numbers shown to another person, which is a reporting act. A
    // counsellor holds `report.read` at `own` and so never sees it.
    key: "centre_team",
    name: "Counsellor performance",
    description: "Each counsellor's active leads, new leads, admissions and overdue follow-ups.",
    permission: "report.center",
    // A seven-column table of people. It had `lg:col-span-2` on its own
    // Card, which worked while the Card was the grid item and stopped
    // working the moment widgets were wrapped — the hazard named two
    // files away and missed here. Declared where the dashboard reads it.
    width: "full",
  },
  {
    key: "accounts",
    name: "Accounts",
    description: "Waiting for a first payment, collected this month, overdue instalments.",
    permission: "payment.read",
  },
  {
    // Keeps the `academics` key: the database stores these as text, and
    // renaming the key would orphan every saved layout row for no gain.
    // Only the label an admin reads has changed.
    key: "academics",
    name: "Students",
    description: "Active students and who joined this month.",
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
