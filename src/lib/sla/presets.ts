/**
 * The policies an institute actually wants, as one-click starting points.
 *
 * ## Why presets rather than a better blank form
 *
 * The form was two JSON textareas. Making them a condition builder and a
 * ladder editor fixes "I cannot type this", and leaves "I do not know
 * what to type" exactly where it was — which is the harder half. Nobody
 * setting up a CRM for the first time knows whether a first-response
 * target should be 4 hours or 24, or that the thing worth measuring on a
 * walk-in is different from the thing worth measuring on a Meta lead.
 *
 * So the screen opens with three policies a coaching institute would
 * recognise, each one fills the form in, and the admin edits what they
 * disagree with. A preset is a filled form, never a saved row: nothing is
 * written until they press Create, and every field stays theirs to change.
 *
 * These are deliberately not seeded into the database. A seeded SLA starts
 * breaching leads on day one for an institute that has not decided it
 * wants to be measured yet, and silently dropping leads into an "At risk"
 * bucket nobody asked for is a worse first impression than an empty list.
 */

import { policyEscalationSteps } from "@/lib/sla/escalations";

export interface SlaPreset {
  key: string;
  /** What it is called on the button. */
  name: string;
  /** One sentence, in the words of somebody running the institute. */
  rationale: string;
  measure: "first_response" | "next_followup" | "in_stage";
  targetHours: number;
  businessHoursOnly: boolean;
  priority: number;
  escalations: Array<{ atHours: number; notifyOwner: boolean; unassign: boolean }>;
}

export const SLA_PRESETS: SlaPreset[] = [
  {
    key: "first_response",
    name: "Answer a new enquiry the same day",
    rationale:
      "Somebody who filled in a form this morning is comparing you with two other institutes this afternoon. This is the one policy worth having if you only have one.",
    measure: "first_response",
    targetHours: 4,
    businessHoursOnly: true,
    priority: 10,
    // One nudge to the counsellor before anybody else is involved, then
    // a second rung that is visible to a centre head. Nothing is taken
    // off anybody: unassigning a lead the moment it is late is how a
    // counsellor learns to stop answering the phone.
    escalations: [
      { atHours: 2, notifyOwner: true, unassign: false },
      { atHours: 8, notifyOwner: false, unassign: false },
    ],
  },
  {
    key: "followup_kept",
    name: "Keep the follow-up date you promised",
    rationale:
      "A counsellor said they would call back on Thursday. This flags it when Thursday has passed and nothing has been logged.",
    measure: "next_followup",
    targetHours: 24,
    businessHoursOnly: true,
    priority: 5,
    escalations: [{ atHours: 24, notifyOwner: true, unassign: false }],
  },
  {
    key: "stuck_in_stage",
    name: "Nobody sits in one stage for a fortnight",
    rationale:
      "Catches the lead that was moved to Counselling Done in March and has not moved since. The slowest kind of loss, and the hardest to see without this.",
    measure: "in_stage",
    targetHours: 336,
    businessHoursOnly: false,
    priority: 1,
    escalations: [{ atHours: 0, notifyOwner: true, unassign: false }],
  },
];

/** The stored JSON shape, built from a preset's readable one. */
export function escalationsToJson(
  steps: Array<{ atHours: number; notifyOwner: boolean; unassign: boolean; notifyRoles?: string[] }>,
): Array<Record<string, unknown>> {
  return steps.map((step) => ({
    at_hours: step.atHours,
    notify_owner: step.notifyOwner,
    unassign: step.unassign,
    ...(step.notifyRoles && step.notifyRoles.length > 0 ? { notify_roles: step.notifyRoles } : {}),
  }));
}

/**
 * What each measure counts, said once so the form and the policy list
 * cannot drift apart.
 *
 * The clock start is the part worth stating. Measuring from lead creation
 * rather than from a follow-up date somebody chose is the whole reason
 * this feature exists — a target you set yourself and can move is not a
 * target.
 */
export const MEASURE_COPY: Record<
  SlaPreset["measure"],
  { label: string; clock: string }
> = {
  first_response: {
    label: "First response",
    clock: "From the moment the lead arrives until somebody logs their first interaction.",
  },
  next_followup: {
    label: "Follow-up kept",
    clock: "From the follow-up date a counsellor promised until they actually log something.",
  },
  in_stage: {
    label: "Time in one stage",
    clock: "From entering the current pipeline stage. Catches leads that quietly stopped moving.",
  },
};

/**
 * The ladder as one line, for the policy list.
 *
 * The list showed a name, a measure and a target, and said nothing at
 * all about what happens when the target is missed — so a policy whose
 * ladder was empty looked identical to one that pages a centre head.
 * Reading the stored steps through the sweep's own parser means the
 * summary cannot claim a rung the sweep will not act on.
 */
export function describeEscalationLadder(raw: unknown): string {
  const steps = policyEscalationSteps(raw);
  if (steps.length === 0) return "Nothing happens when it is missed, beyond showing up under At risk.";

  return steps
    .map((step) => {
      const when = step.atHours === 0 ? "as soon as it is late" : `${describeHours(step.atHours)} late`;
      const what: string[] = [];
      if (step.notifyOwner) what.push("tell the counsellor");
      if (step.notifyRoles.length > 0) what.push("tell the roles named on it");
      if (step.unassign) what.push("take it off them");
      // A rung with nothing ticked still notifies the event's default
      // roles, which is the sweep's behaviour and not nothing.
      return `${when}: ${what.length > 0 ? what.join(", ") : "notify whoever the SLA alert is set to"}`;
    })
    .join(" · ");
}

/** 336 hours is two weeks, and nobody reads it as two weeks. */
export function describeHours(hours: number): string {
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = hours / 24;
  if (Number.isInteger(days) && days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  const weeks = hours / 168;
  if (Number.isInteger(weeks)) return `${weeks} week${weeks === 1 ? "" : "s"}`;
  return `${hours} hours`;
}
