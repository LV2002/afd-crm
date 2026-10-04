/**
 * Which tables hold configuration, and which hold the work.
 *
 * The line this draws is the one CLAUDE.md § Plug-and-play already draws:
 * *could this system be deployed for a completely different company by
 * changing only database contents?* Everything that answers "yes" is
 * configuration and survives a reset. Everything that is a record of
 * something that happened is data and does not.
 *
 * Two lists rather than one, deliberately. A single "wipe these" list would
 * silently miss a table added later — which is the failure that matters,
 * because a missed table leaves a lead's interactions pointing at a lead
 * that no longer exists. `tests/reset-tables.spec.ts` asserts that the two
 * lists together cover every table in the database, so a new one has to be
 * classified before the suite goes green.
 */

/** Survives a reset: the shape of the institute, not its history. */
export const CONFIG_TABLES = [
  "assignment_rules",
  // Class groups. Leon's own words: "I want batches to be something I
  // create in my settings" — they are set up once a term and referred to
  // constantly, which makes them configuration.
  "batches",
  "business_hours",
  "centers",
  // Exported configuration bundles. Deleting the backups during a reset
  // would remove the one thing that could undo it.
  "config_snapshots",
  "dashboard_layouts",
  "discount_limits",
  "dropdown_categories",
  "dropdown_options",
  "fee_structures",
  "field_definitions",
  // The accounts themselves, including the opening balance somebody typed
  // in. The transactions against them are data and go.
  "finance_accounts",
  "holidays",
  "integration_credentials",
  "notification_settings",
  "org_settings",
  "payment_reminder_rules",
  // The fixed registry of permission primitives. Seeded from code.
  "permissions",
  "pipeline_stages",
  // People who work here. Their logins live in Supabase's own `auth.users`
  // and are not touched either.
  "profiles",
  "promos",
  "role_permissions",
  "roles",
  "sla_policies",
  "tags",
  "targets",
  "temperature_rules",
  "terminology",
  "user_centers",
  "whatsapp_flow_steps",
  "whatsapp_flows",
  /**
   * People who replied STOP.
   *
   * The one row on this list that is plainly a record of something that
   * happened rather than a setting — and it stays anyway. Deleting a
   * suppression means messaging somebody who told you not to, which is a
   * consent problem no amount of "we were testing" repairs. A suppression
   * is keyed by phone number, so it survives the lead it came from.
   */
  "whatsapp_suppressions",
] as const;

/** Cleared by a reset: a record of something that happened. */
export const DATA_TABLES = [
  // Who is in which retargeting audience. Rebuilt from the leads by the
  // nightly sync, so there is nothing here to preserve.
  "ad_audience_members",
  /**
   * Real money spent on real ads, pulled from Meta and Google.
   *
   * Classified as data because it is a record rather than a setting, and
   * because during a test period it is mixed in with nothing. Worth knowing
   * before you run this: the nightly sync only fetches yesterday, so months
   * already pulled down are not re-fetched. The dry run prints the row
   * count, and `--keep-ad-spend` leaves it alone.
   */
  "ad_spend_daily",
  "assignment_history",
  "attachments",
  /**
   * The audit log goes too, and the reset writes itself into the empty one.
   *
   * Uncomfortable, and correct here: after a wipe every audit row points at
   * a lead, payment or enrolment that no longer exists, so keeping them
   * preserves no answer to any question — only the appearance of one. The
   * single row the reset leaves behind says who did it and when, which is
   * the fact that actually matters afterwards.
   */
  "audit_log",
  "enquiries",
  "enrolment_instalments",
  "enrolment_promos",
  "enrolments",
  "error_events",
  "finance_transactions",
  "google_conversion_uploads",
  // Conversations that happened, and the messages in them. Data, not
  // configuration, however much the inbox looks like a setting.
  "instagram_conversations",
  "instagram_messages",
  "interactions",
  "lead_identifiers",
  "lead_merges",
  // The links between leads and tags. The tags themselves are configuration.
  "lead_tags",
  "leads",
  "merge_review_queue",
  "notifications",
  "payment_reminders_sent",
  "payments",
  "receipts",
  "stage_history",
  "student_batches",
  "students",
  "tasks",
  "webhook_events",
  "whatsapp_broadcast_recipients",
  // A broadcast is a send that happened, not a template. The templates and
  // the automation flows are configuration and stay.
  "whatsapp_broadcasts",
  "whatsapp_flow_run_events",
  "whatsapp_flow_runs",
  "whatsapp_messages",
] as const;

/**
 * Sequences that must go back to 1 so the first real lead is #1 and the
 * first real receipt is #1.
 *
 * `TRUNCATE ... RESTART IDENTITY` resets a sequence OWNED by a truncated
 * table's column, which covers `leads.lead_number`, `receipts.receipt_no`
 * and `finance_transactions.txn_no`. `student_code_seq` is a standalone
 * sequence used in a default expression (migration 0017), owned by nothing,
 * so nothing resets it automatically — and a first real student coded
 * STU000014 is a small, permanent reminder of the test data.
 */
export const UNOWNED_SEQUENCES = ["student_code_seq"] as const;

export type ConfigTable = (typeof CONFIG_TABLES)[number];
export type DataTable = (typeof DATA_TABLES)[number];
