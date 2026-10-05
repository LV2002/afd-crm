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
  category: "Leads" | "SLA" | "Admissions" | "Money" | "Academics";
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
    // The companion to lead.assigned, and the answer to "who hears about
    // a lead nobody was given?". `lead.assigned` tells the counsellor it
    // landed on; a lead that matched no assignment rule has no counsellor,
    // so before this it arrived in total silence and waited in the
    // Unassigned queue for somebody to think to look.
    //
    // Fires for every new lead, assigned or not, because the person
    // running a centre wants intake visible either way — and the owner is
    // deliberately NOT notified here, since they already get
    // `lead.assigned` about the same lead a moment later.
    key: "lead.created",
    label: "New lead arrived",
    description:
      "A lead entered the system from any source — an ad, the website, an import, or typed in by hand. Says who it went to, or that it went to nobody.",
    category: "Leads",
    variables: ["lead_name", "lead_number", "source", "owner_name", "center_name"],
    defaultTitle: "New lead: {{lead_name}}",
    defaultBody: "#{{lead_number}} from {{source}} at {{center_name}}. Assigned to {{owner_name}}.",
    defaultNotifyOwner: false,
    defaultNotifyRoleCodes: ["center_head"],
  },
  {
    // The import's answer to `lead.created`, which it suppresses.
    //
    // A two-hundred-row spreadsheet firing two hundred arrival notices
    // at a centre head is not visibility — it is the one person meant to
    // be watching intake losing the next real lead underneath a wall of
    // their own import. One line, after the run, with the numbers.
    key: "lead.imported",
    label: "Leads imported from a file",
    description:
      "Somebody finished a CSV import. Says how many were created, how many attached to people already in the system, and how many were skipped.",
    category: "Leads",
    variables: ["total", "created", "matched", "skipped", "imported_by", "center_name"],
    defaultTitle: "{{created}} leads imported",
    defaultBody:
      "{{imported_by}} imported {{total}} rows: {{created}} new, {{matched}} matched to existing people, {{skipped}} skipped.",
    defaultNotifyOwner: false,
    defaultNotifyRoleCodes: ["center_head"],
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
    // One event for course, batch, mode and academic year rather than one
    // each, because they move together on one form and a person who
    // switched course and batch in the same breath should produce one
    // message saying both, not two saying half each. `changes` carries
    // the detail: "Course: Foundation → DWO · Batch: Kochi A → Kochi B".
    //
    // Also fired by Settings → Batches, so moving somebody between class
    // groups reads the same wherever it was done.
    key: "enrolment.plan_changed",
    label: "Course or batch changed",
    description:
      "Somebody changed what a confirmed student is enrolled on — their course, batch, mode or academic year. Accounts may need to re-check the fee; academics need to know who is in which room.",
    category: "Academics",
    variables: ["student_name", "changes", "changed_by", "course", "center_name"],
    defaultTitle: "Plan changed: {{student_name}}",
    defaultBody: "{{changes}} — changed by {{changed_by}}.",
    // The counsellor who sold it is the one the family rings about it.
    defaultNotifyOwner: true,
    // Accounts above all: a course change does NOT move the fee (see
    // changeEnrolmentPlan), so the one department that has to decide
    // whether the money should follow is the one that did not make the
    // change. Co-admin and admin are on it because a student quietly
    // studying something other than what they are being billed for is the
    // kind of thing somebody senior should see without being asked.
    defaultNotifyRoleCodes: ["accounts", "academics", "center_head", "co_admin", "admin"],
  },
  {
    // Deliberately separate from the plan change above: the audience is
    // different. A batch move is academics' business and accounts can
    // ignore it; a fee that moved is the opposite, and burying it inside
    // a general "something changed" event is how a ₹20,000 correction
    // goes unread.
    key: "enrolment.fee_changed",
    label: "Fee changed after admission",
    description:
      "The agreed fee or instalment schedule of a confirmed admission was changed. Only fires after the admission is confirmed — setting the fee for the first time is not a change.",
    category: "Money",
    variables: ["student_name", "old_fee", "new_fee", "changed_by", "center_name"],
    defaultTitle: "Fee changed: {{student_name}}",
    defaultBody: "{{old_fee}} → {{new_fee}}, changed by {{changed_by}}.",
    defaultNotifyOwner: true,
    defaultNotifyRoleCodes: ["accounts", "center_head"],
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
    key: "discount.approval_requested",
    label: "Discount needs approval",
    description:
      "Somebody agreed a discount larger than their role allows. Until it is approved the student owes the full fee, so this is worth answering the same day.",
    category: "Money",
    variables: ["lead_name", "amount", "percent", "requested_by"],
    defaultTitle: "Discount to approve: {{lead_name}}",
    defaultBody:
      "{{requested_by}} agreed {{amount}} off ({{percent}}%) for {{lead_name}}. It is not applied until you approve it.",
    // The person who asked is told by the screen they asked on, and notify()
    // never tells somebody about their own action anyway.
    defaultNotifyOwner: false,
    defaultNotifyRoleCodes: ["center_head", "admin"],
  },
  {
    key: "discount.decided",
    label: "Discount approved or rejected",
    description:
      "Somebody settled a discount request. The counsellor who agreed it with the student is the one who has to go back to them either way.",
    category: "Money",
    variables: ["lead_name", "amount", "decision", "decided_by", "note"],
    defaultTitle: "Discount {{decision}}: {{lead_name}}",
    defaultBody: "{{decided_by}} {{decision}} the {{amount}} discount for {{lead_name}}. {{note}}",
    defaultNotifyOwner: true,
    defaultNotifyRoleCodes: [],
  },
  {
    key: "payment.overdue",
    label: "Fee instalment overdue",
    description:
      "An instalment passed its due date without being paid. Sent by the nightly reminder sweep on the rungs an admin sets in Settings → Payment Reminders.",
    category: "Money",
    variables: ["student_name", "amount", "days_overdue", "due_date", "course"],
    defaultTitle: "Overdue: {{student_name}}",
    defaultBody:
      "{{amount}} was due on {{due_date}} and is {{days_overdue}} days late for {{course}}.",
    // The counsellor who sold the admission is usually the one the family
    // actually answers the phone to.
    defaultNotifyOwner: true,
    defaultNotifyRoleCodes: ["accounts", "center_head"],
  },
  {
    key: "flow.step_reached",
    label: "Automation reached a step that needs a person",
    description:
      "A WhatsApp automation flow hit a 'tell the counsellor' step — usually because the lead replied something the flow can't answer on its own.",
    // Sits with the other lead-conversation events; a counsellor reads
    // this next to "reply received", not in a category of its own.
    category: "Leads",
    variables: ["lead_name", "lead_number", "message"],
    defaultTitle: "{{lead_name}} needs you",
    defaultBody: "{{message}}",
    // The counsellor who owns the lead. An automation handing a
    // conversation back is handing it to the person whose conversation it
    // is, not to a queue.
    defaultNotifyOwner: true,
    defaultNotifyRoleCodes: [],
  },
  {
    // The one notification that is about the CRM rather than about a
    // person, and the one whose absence costs the most.
    //
    // Platform failures went out by email alone, to `ALERT_EMAIL_TO`.
    // Email needs an API key, a from-address and a recipient, and until
    // all three are set a webhook that has stopped accepting Meta leads
    // tells nobody at all — which is the single most expensive silent
    // failure this system has, because the symptom is "it has been quiet
    // this week" and the cause is three weeks old by the time anyone
    // checks.
    //
    // In the bell it needs no configuration beyond existing. The email
    // still goes out as well, with the same ten-times-as-often damping,
    // so this is not a second firehose.
    key: "system.failure",
    label: "Something broke",
    description:
      "A webhook, a nightly job or a screen failed. Sent on the first occurrence and then only when it has happened ten times as often, so a fault firing every few seconds cannot fill the bell.",
    category: "SLA",
    variables: ["source", "message", "count"],
    defaultTitle: "Something broke: {{source}}",
    defaultBody: "{{message}} — seen {{count}} time(s). Open Platform Health for the detail.",
    defaultNotifyOwner: false,
    defaultNotifyRoleCodes: ["admin", "co_admin"],
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
  {
    // Money going back out is the one financial movement nobody else can
    // see coming. A payment arriving is visible on the lead, in the
    // balance, on the receipt; a payment being undone changes all three
    // in the other direction, silently, days later. The counsellor who
    // told a family their fee was settled is the person most likely to be
    // asked about it and the least likely to know.
    key: "payment.reversed",
    label: "Payment reversed or refunded",
    description:
      "Accounts undid a payment — either a reversal (it was recorded in error) or a refund (the money went back to the family). The student's balance goes up again.",
    category: "Money",
    variables: ["student_name", "amount", "kind", "reason", "reversed_by", "center_name"],
    defaultTitle: "Payment {{kind}}: {{student_name}}",
    defaultBody: "{{amount}} — {{reason}} ({{reversed_by}}). Their balance has gone back up.",
    defaultNotifyOwner: true,
    defaultNotifyRoleCodes: ["accounts", "center_head"],
  },
  {
    // The answer to "how does academics find out?". The gate itself was
    // silent: a `students` row appeared and the people whose job starts
    // there were told nothing. The Onboarding queue is the durable version
    // of this signal; the notification is the one that arrives unprompted.
    key: "student.created",
    label: "Student joined (accounts → academics)",
    description:
      "A first payment cleared, so a student record now exists and is waiting to be onboarded.",
    category: "Academics",
    variables: ["student_name", "course", "batch_name", "center_name"],
    defaultTitle: "New student to onboard: {{student_name}}",
    defaultBody: "{{course}} · {{batch_name}}. Their first payment has cleared.",
    // Not the lead's owner. The counsellor already hears about the payment
    // itself through `payment.recorded`, and a second message about the same
    // event is how people learn to ignore the bell.
    defaultNotifyOwner: false,
    defaultNotifyRoleCodes: ["academics"],
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
