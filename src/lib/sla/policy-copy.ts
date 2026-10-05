/**
 * The words the SLA screens use, and the two helpers that format them.
 *
 * ## Why there are no starting-point policies here
 *
 * There were, briefly: three presets a button filled the form in with.
 * Leon asked for them out — *"i dont want you to create premade SLAs but
 * rather allow me to create SLAs but just make them easier to create"* —
 * and he is right that those are different jobs. A screen offering three
 * named policies is making the institute's decision about what it will be
 * measured on, which is his call and not the software's. Making the form
 * easy to fill in is the software's job, and that is what is left:
 *
 * - the condition builder instead of an "Applies to (JSON)" textarea,
 * - a row editor instead of an "Escalation ladder (JSON array)" textarea,
 * - plain English under every control saying what the clock measures,
 * - hours said back as days and weeks, because nobody reads 336 as a
 *   fortnight.
 *
 * None of that decides anything for him. All of it removes a reason to
 * give up halfway down the form.
 */

import { policyEscalationSteps } from "@/lib/sla/escalations";

/** What a policy can measure. The stored enum, as the form offers it. */
export type SlaMeasure = "first_response" | "next_followup" | "in_stage";

export const SLA_MEASURES: SlaMeasure[] = ["first_response", "next_followup", "in_stage"];

/** The stored JSON shape, built from the editor's readable one. */
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
export const MEASURE_COPY: Record<SlaMeasure, { label: string; clock: string }> = {
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
  if (steps.length === 0) {
    return "Nothing happens when it is missed, beyond showing up under At risk.";
  }

  return steps
    .map((step) => {
      const when =
        step.atHours === 0 ? "as soon as it is late" : `${describeHours(step.atHours)} late`;
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
