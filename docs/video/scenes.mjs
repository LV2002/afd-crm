/**
 * The launch walkthrough, scene by scene.
 *
 * A silent, text-driven training film for staff: seven minutes that take
 * somebody from "I have never seen this" to "I know where things are and
 * what I must not get wrong".
 *
 * ## Two rules this file follows
 *
 * **Everything here is true of the system as built.** Stage names,
 * counts, button labels, the four queue buckets, the masking format —
 * each was read out of the code, not remembered. If a screen changes,
 * the scene changes with it.
 *
 * **Nothing here pretends to be a screenshot.** The diagrams are plainly
 * diagrams: no fake student names, no invented numbers, no mock browser
 * chrome. A launch video that fakes the product teaches people a
 * product that does not exist.
 *
 * `hold` is the time in seconds a scene stays on screen. The renderer
 * raises it if the words on screen cannot be read that fast — see
 * `minimumHold()` in render.mjs — so these are floors, not promises.
 */

export const SCENES = [
  // ───────────────────────────────── Opening
  {
    type: "title",
    hold: 10,
    title: "AFD India CRM",
    subtitle: "A walkthrough for the team",
    footnote: "Silent — read at your own pace. Pause any time.",
  },
  {
    type: "statement",
    hold: 7,
    text: "Everything about a student, from the first enquiry to the day they enrol, in one place.",
  },
  {
    type: "statement",
    hold: 10,
    text: "If it is not in the CRM, as far as the institute is concerned it did not happen.",
    emphasis: true,
  },

  // ───────────────────────────────── The shape of the thing
  { type: "chapter", hold: 3.5, number: "01", title: "How the whole thing is shaped" },
  {
    type: "pipeline",
    hold: 8,
    caption: "A person moves through four departments. Two of the handovers are one-way doors.",
  },
  {
    type: "gates",
    hold: 10,
    caption: "These two moments explain most of what the system does — and most of what confuses people.",
  },

  // ───────────────────────────────── Vocabulary
  { type: "chapter", hold: 3.5, number: "02", title: "Six words that mean something specific" },
  {
    type: "definitions",
    hold: 12,
    items: [
      ["Lead", "A prospective student. The person, not the enquiry."],
      ["Enquiry", "One inbound event. Many enquiries, one lead."],
      ["Stage", "How far along they are in the funnel."],
      ["Temperature", "How likely they are to actually join."],
      ["Enrolment", "The commercial record: course, fee, instalments."],
      ["Student", "The academic record. Created when they pay."],
    ],
  },
  {
    type: "contrast",
    hold: 13,
    heading: "Stage and temperature are not the same thing",
    left: { label: "Stage", text: "Where they are in the process" },
    right: { label: "Temperature", text: "How likely they are to join" },
    note: "They move independently. Hot at Contacted, Cold at Demo Scheduled — both normal.",
  },

  // ───────────────────────────────── Getting around
  { type: "chapter", hold: 3.5, number: "03", title: "Getting around" },
  {
    type: "sidebar",
    hold: 5,
    caption: "The sidebar only shows what your role may use. A missing entry is not a fault.",
  },
  {
    type: "badges",
    hold: 5,
    caption: "Five entries carry a red count. Each is a queue somebody is meant to empty.",
  },

  // ───────────────────────────────── The daily routine
  { type: "chapter", hold: 3.5, number: "04", title: "Your day" },
  {
    type: "buckets",
    hold: 5,
    caption: "The Dashboard is where every morning starts. Work the buckets in this order.",
  },
  {
    type: "statement",
    hold: 8.5,
    text: "At risk means Hot with no next step, or a response target missed. Somebody who matters, about to be forgotten.",
  },

  // ───────────────────────────────── Leads
  { type: "chapter", hold: 3.5, number: "05", title: "Finding and creating leads" },
  {
    type: "steps",
    hold: 8,
    heading: "Find somebody",
    steps: [
      "Open Leads",
      "Type part of a name or a phone number",
      "Press Enter — nothing happens until you do",
    ],
  },
  {
    type: "masked",
    hold: 8.5,
    caption: "Phone numbers are masked in every list. Open the lead and click to reveal — and that reveal is recorded.",
  },
  {
    type: "steps",
    hold: 17.5,
    heading: "Create a walk-in",
    steps: [
      "Leads → New lead",
      "Student name and Primary phone — the only required fields",
      "Centre, city, exams, courses, exam year",
      "Referred by — if somebody sent them, record it now",
    ],
    note: "Referrals are among the best sources an institute has, and this is the only place they are captured.",
  },

  // ───────────────────────────────── The habit
  { type: "chapter", hold: 3.5, number: "06", title: "The one habit that matters" },
  {
    type: "statement",
    hold: 6.5,
    text: "If a call is not logged, it did not happen.",
    emphasis: true,
  },
  {
    type: "steps",
    hold: 15.5,
    heading: "Log an interaction",
    steps: [
      "Type — Call, WhatsApp, Email, SMS, Walk-in, Meeting or Note",
      "Outcome — Connected, Not Reachable, Call Back Later, Interested…",
      "Notes — write for the colleague covering your leave",
      "Next action — what happens next",
      "Next follow-up — the date and time. Set this.",
    ],
  },
  {
    type: "statement",
    hold: 7.5,
    text: "A lead with no next follow-up drops off every queue in the system. Nobody chases it. Nobody notices.",
  },

  // ───────────────────────────────── Rules
  { type: "chapter", hold: 3.5, number: "07", title: "Three rules worth knowing early" },
  {
    type: "rule",
    hold: 12,
    rule: "A duplicate is never rejected",
    detail: "Enter somebody who already exists and you get no error. The enquiry attaches to the person you already have, or the pair goes to Merge review.",
  },
  {
    type: "rule",
    hold: 10,
    rule: "Nothing is ever really deleted",
    detail: "Deleting hides a record and keeps who did it and why. It can be restored. Financial records cannot even be hidden.",
  },
  {
    type: "rule",
    hold: 9.5,
    rule: "Money is never edited",
    detail: "A payment recorded wrongly is corrected with a reversal that points at the original — so the history stays readable a year later.",
  },

  // ───────────────────────────────── Pipeline
  { type: "chapter", hold: 3.5, number: "08", title: "The pipeline" },
  {
    type: "stages",
    hold: 5.5,
    caption: "Fourteen stages ship with the system. Drag a card on the Pipeline board to move somebody along.",
  },
  {
    type: "statement",
    hold: 9.5,
    text: "Dragging to Lost asks for a reason. “We lost them” teaches nobody anything; the reasons are the most useful column in the sources report.",
  },

  // ───────────────────────────────── Gate 1
  { type: "chapter", hold: 3.5, number: "09", title: "Confirming an admission" },
  {
    type: "steps",
    hold: 11,
    heading: "Confirm admission",
    steps: [
      "Course, Mode and Academic year — what they are actually joining",
      "Batch, if one is chosen",
      "Discount, if you are giving one",
      "Confirm admission → Yes, confirm it",
    ],
  },
  {
    type: "warning",
    hold: 14,
    heading: "This is a one-way door",
    text: "Confirming ends sales work on that lead and hands the family to accounts. Only an administrator can walk it back.",
    note: "Do it when the admission is actually agreed — not when it looks likely.",
  },
  {
    type: "statement",
    hold: 10.5,
    text: "The course is asked here rather than copied from the lead, because what somebody enquired about and what they join are often not the same thing.",
  },

  // ───────────────────────────────── Fees
  { type: "chapter", hold: 3.5, number: "10", title: "Fees, payments and receipts" },
  {
    type: "steps",
    hold: 14.5,
    heading: "Agree the plan",
    steps: [
      "Course fee, discount, down payment",
      "Instalments — a date and an amount for each",
      "The panel tells you if they do not add up to the payable amount",
      "Print the agreement, have it signed, upload the signed copy",
    ],
  },
  {
    type: "steps",
    hold: 11,
    heading: "Record a payment",
    steps: [
      "Admissions → the student → Record a payment",
      "Amount, Method, Received into, Reference",
      "Record payment → Yes, record it",
    ],
    note: "Accounts and administrators only. Counsellors cannot record payments, deliberately.",
  },
  {
    type: "statement",
    hold: 9.5,
    text: "The first cleared payment creates the student record automatically. That is the second gate, and nobody has to remember to do it.",
  },
  {
    type: "statement",
    hold: 7.5,
    text: "Receipt numbers come from the database in an unbroken run — no gaps, no collisions, whoever is typing.",
  },

  // ───────────────────────────────── Students
  { type: "chapter", hold: 3.5, number: "11", title: "Students and profile forms" },
  {
    type: "steps",
    hold: 14,
    heading: "The profile form",
    steps: [
      "On the lead: Create profile form link",
      "Copy link and send it to the student",
      "They fill it in — no login needed",
      "Their answers appear on the lead. Mark read when you have looked.",
    ],
  },
  {
    type: "statement",
    hold: 9.5,
    text: "Onboarding is a queue, not a status. Press Onboarding done only when it is actually done — that button is the only record the work happened.",
  },

  // ───────────────────────────────── Chats
  { type: "chapter", hold: 3.5, number: "12", title: "Chats" },
  {
    type: "channels",
    hold: 4,
    caption: "Three channels across the top of the Chats section.",
  },
  {
    type: "rule",
    hold: 10.5,
    rule: "The 24-hour rule is Meta's, not ours",
    detail: "A free-form reply is only allowed within 24 hours of the person's last message. After that, only an approved template.",
  },
  {
    type: "statement",
    hold: 9.5,
    text: "An Instagram DM does not create a lead. Most are a question or a reply to a story. Press Convert to lead when one becomes a real enquiry.",
  },

  // ───────────────────────────────── Reporting
  { type: "chapter", hold: 3.5, number: "13", title: "Knowing how it is going" },
  {
    type: "definitions",
    hold: 8.5,
    items: [
      ["Insights", "Eight tabs: explore, sources, timing, handovers, segments, referrals, targets, activity."],
      ["Ad Performance", "What advertising cost, and what it actually produced."],
      ["Ask AI", "A question in plain English. It answers; it never changes anything."],
    ],
  },
  {
    type: "statement",
    hold: 9.5,
    text: "Two people can open the same report and honestly see different totals. Reports are scoped — your leads, your centre, or the institute.",
  },

  // ───────────────────────────────── Roles
  { type: "chapter", hold: 3.5, number: "14", title: "Who can do what" },
  {
    type: "roles",
    hold: 6.5,
    caption: "Six roles ship with the system. Every one of them is an editable record, not something fixed in the software.",
  },
  {
    type: "statement",
    hold: 9,
    text: "Access is enforced in the database, not hidden on the screen. You cannot reach another counsellor's lead by typing its address.",
  },

  // ───────────────────────────────── Close
  { type: "chapter", hold: 3.5, number: "15", title: "Every morning" },
  {
    type: "steps",
    hold: 15.5,
    heading: "Ten minutes, in this order",
    steps: [
      "Open the Dashboard",
      "Overdue first — these people were promised a call",
      "Due today, then New, then At risk",
      "Check Chats for replies, and the bell for notifications",
    ],
    note: "Every lead you touch gets a logged interaction and a next date.",
  },
  {
    type: "help",
    hold: 4.5,
    caption: "The full manual lives inside the CRM.",
  },
  {
    type: "outro",
    hold: 8.5,
    title: "That is the whole system",
    subtitle: "Nineteen chapters of detail are waiting at /manual",
  },
];
