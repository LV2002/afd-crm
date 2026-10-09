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
   *
   * The grid is six columns from `lg` up, not two, so that a pair can be
   * uneven: `wide` (four) beside `narrow` (two) is the counsellor's
   * dashboard, numbers given the room and the links kept to a column.
   * `half` is still three and still pairs with another half, so every
   * other role's layout is exactly what it was.
   */
  width?: "narrow" | "half" | "wide" | "full";
}

export const DASHBOARD_WIDGETS: WidgetDefinition[] = [
  {
    key: "my_numbers",
    name: "Your numbers",
    description:
      "This month's leads, admissions and follow-ups due, then the whole cycle year to date.",
    permission: "lead.read",
    // Two thirds, with Quick links in the remaining third. It carries a
    // chart, three hero figures and eight tiles; at half width the tiles
    // wrapped to two columns and the card became a ladder.
    width: "wide",
  },
  {
    /*
      Your day moved to the Follow-ups screen in October 2026.

      It was the right content in the wrong column: a long queue in the
      dashboard's narrow half, squeezing the numbers card beside it into
      a ladder. It now sits at the top of Follow-ups, above the dated
      list it belongs with, and this slot holds something actually
      narrow. A saved layout still naming `my_day` is ignored rather
      than breaking — the resolver works from this registry.
    */
    key: "quick_links",
    name: "Quick links",
    description: "Add a lead, today's follow-ups, log an interaction, view all leads.",
    permission: "lead.read",
    width: "narrow",
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
