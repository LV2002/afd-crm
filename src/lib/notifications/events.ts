/**
 * The events the system knows how to notify about.
 *
 * Fixed in code, on exactly the same discipline as the permission
 * primitives in `lib/auth/permissions.ts`: every key here corresponds to a
 * real `notify()` call somewhere in the codebase, and a key with no call
 * site notifies nobody. Adding one "for later" would put a switch in the
 * admin UI that silently does nothing — which is the failure this whole
 * feature exists to fix, since the SLA escalation ladder had been
 * configurable and inert for months.
 *
 * What IS configurable, per event, without a deploy: whether it notifies at
 * all, which roles, whether the lead's own owner, and the exact wording.
 * See `notification_settings`.
 */

export interface NotificationEventDefinition {
  key: string;
  label: string;
  /** What actually happened, in the admin's language. */
  description: string;
  /** Where the notification points. Grouped in the settings UI. */
  category: "Leads" | "SLA" | "Admissions" | "Money";
  /**
   * Template variables this event supplies. The settings screen lists
   * them, so an admin writing copy can see what they may use rather than
   * guessing and getting a literal `{{whatever}}` in front of staff.
   */
  variables: readonly string[];
  /** Shipped as seed data. An admin may rewrite both freely. */
  defaultTitle: string;
  defaultBody: string;
  /** Whether the lead's owner is notified, before an admin changes it. */
  defaultNotifyOwner: boolean;
  /**
   * Role codes notified out of the box. Codes, not ids, because the seed
   * resolves them — and because a role an institute renamed still has its
   * code. Empty means "nobody but possibly the owner", which is the right
   * default for events that are only ever personal.
   */
  defaultNotifyRoleCodes: readonly string[];
}

export const NOTIFICATION_EVENTS = [
  {
    key: "lead.assigned",
    label: "Lead assigned",
    description: "A lead was assigned to a counsellor, by a rule or by hand.",
    category: "Leads",
    variables: ["lead_name", "lead_number", "source", "center_name"],
    defaultTitle: "New lead: {{lead_name}}",
    defaultBody: "Lead #{{lead_number}} from {{source}} has been assigned to you.",
    defaultNotifyOwner: true,
    defaultNotifyRoleCodes: [],
  },
  {
    key: "lead.sla_breached",
    label: "SLA breached",
    description: "A lead passed its response or follow-up target without being worked.",
    category: "SLA",
    variables: ["lead_name", "lead_number", "policy_name", "hours_overdue", "center_name"],
    defaultTitle: "SLA breached: {{lead_name}}",
    defaultBody:
      "Lead #{{lead_number}} has missed the {{policy_name}} target by {{hours_overdue}} hours.",
    defaultNotifyOwner: true,
    defaultNotifyRoleCodes: ["center_head"],
  },
  {
    key: "lead.sla_escalated",
    label: "SLA escalation step",
    description:
      "A step on an SLA policy's escalation ladder came due — the rung above a plain breach.",
    category: "SLA",
    variables: ["lead_name", "lead_number", "policy_name", "at_hours", "center_name"],
    defaultTitle: "Escalation: {{lead_name}}",
    defaultBody:
      "Lead #{{lead_number}} is {{at_hours}} hours past the {{policy_name}} target and still not worked.",
    defaultNotifyOwner: false,
    defaultNotifyRoleCodes: ["center_head", "co_admin"],
  },
  {
    key: "whatsapp.reply_received",
    label: "WhatsApp reply",
    description:
      "Somebody replied to a message sent from the institute's WhatsApp Business API number. Only the lead's own counsellor is told by default — a reply is a conversation for whoever owns that person, not an announcement.",
    category: "Leads",
    variables: ["lead_name", "lead_number", "message", "center_name"],
    defaultTitle: "{{lead_name}} replied on WhatsApp",
    defaultBody: "{{message}}",
    defaultNotifyOwner: true,
    defaultNotifyRoleCodes: [],
  },
  {
    key: "admission.confirmed",
    label: "Admission confirmed",
    description:
      "A counsellor confirmed an admission — the sales→accounts gate. Accounts needs to pick it up.",
    category: "Admissions",
    variables: ["lead_name", "lead_number", "course", "counsellor_name", "center_name"],
    defaultTitle: "Admission confirmed: {{lead_name}}",
    defaultBody:
      "{{counsellor_name}} confirmed {{lead_name}} for {{course}}. Ready for fee collection.",
    defaultNotifyOwner: false,
    defaultNotifyRoleCodes: ["accounts", "center_head"],
  },
  {
    key: "admission.dropped",
    label: "Admission dropped",
    description:
      "A student left the course. Sales stop counting it as a conversion, accounts stop chasing the fee, academics take them off the register.",
    category: "Admissions",
    variables: ["student_name", "course", "reason", "recorded_by", "center_name"],
    defaultTitle: "Dropped: {{student_name}}",
    defaultBody: "{{student_name}} has dropped {{course}}. Reason given: {{reason}}.",
    // The counsellor who sold it is the one person who will be asked
    // about it, so they hear by default even though they can't record it.
    defaultNotifyOwner: true,
    defaultNotifyRoleCodes: ["accounts", "center_head", "academics"],
  },
  {
    key: "profile_form.submitted",
    label: "Student profile form submitted",
    description: "A student filled in the profile form their counsellor sent them.",
    category: "Admissions",
    variables: ["lead_name", "lead_number", "center_name"],
    defaultTitle: "Profile form in: {{lead_name}}",
    defaultBody: "{{lead_name}} has submitted their student profile form.",
    defaultNotifyOwner: true,
    defaultNotifyRoleCodes: [],
  },
  {
    key: "payment.recorded",
    label: "Payment recorded",
    description:
      "Accounts recorded a payment. The first cleared payment is the accounts→academics gate.",
    category: "Money",
    variables: ["student_name", "amount", "method", "receipt_number", "center_name"],
    defaultTitle: "Payment received: {{student_name}}",
    defaultBody: "{{amount}} received by {{method}}. Receipt {{receipt_number}}.",
    defaultNotifyOwner: true,
    defaultNotifyRoleCodes: ["accounts"],
  },
] as const satisfies readonly NotificationEventDefinition[];

export type NotificationEventKey = (typeof NOTIFICATION_EVENTS)[number]["key"];

export const NOTIFICATION_EVENT_KEYS: readonly NotificationEventKey[] =
  NOTIFICATION_EVENTS.map((e) => e.key);

export function isNotificationEventKey(value: string): value is NotificationEventKey {
  return (NOTIFICATION_EVENT_KEYS as readonly string[]).includes(value);
}

export function notificationEvent(
  key: NotificationEventKey,
): NotificationEventDefinition {
  const found = NOTIFICATION_EVENTS.find((e) => e.key === key);
  // Unreachable through the type, but a runtime key from the database that
  // no longer exists in code should say so rather than return undefined and
  // fail three frames later.
  if (!found) throw new Error(`Unknown notification event: ${key}`);
  return found;
}
