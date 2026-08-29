import { evaluateConditions, type RuleConditions } from "@/lib/assignment/evaluate-conditions";
import type { leads, slaPolicies } from "@/lib/db/schema";

import { computeBusinessHoursElapsed, type DayHours } from "./business-hours";

type Lead = typeof leads.$inferSelect;
type SlaPolicyRow = typeof slaPolicies.$inferSelect;

export interface SlaEvaluationInput {
  lead: Lead;
  /** Active policies — any order; sorted by priority internally. */
  policies: SlaPolicyRow[];
  /** When the lead entered its current stage — a stage_history row, or the lead's own createdAt if it's never moved. */
  currentStageEnteredAt: Date;
  /** The lead's centre's business hours; empty if the centre has none configured (or the lead has no centre). */
  businessHours: DayHours[];
  holidayDates: ReadonlySet<string>;
  timeZone: string;
  now: Date;
}

export interface SlaEvaluationResult {
  policyId: string | null;
  breached: boolean;
  elapsedHours: number;
}

/**
 * The baseline instant a policy's `measure` counts elapsed time from, or
 * `null` when that measure doesn't currently apply to this lead at all
 * (docs/01-DATA-MODEL.md § SLA policies' three measures):
 *
 * - `first_response`: from lead creation, until a first response is
 *   recorded (`leads.first_response_at`, stamped by `logInteraction()` —
 *   see docs/DECISIONS.md) — once responded, this measure is satisfied
 *   for good, so a matching policy no longer breaches.
 * - `next_followup`: from the scheduled `next_followup_at`, only once
 *   that moment has actually passed — a follow-up scheduled for later
 *   isn't overdue yet, so there's nothing to measure against.
 * - `in_stage`: from whenever the lead entered its current pipeline stage.
 */
function measureBaseline(policy: SlaPolicyRow, lead: Lead, currentStageEnteredAt: Date, now: Date): Date | null {
  switch (policy.measure) {
    case "first_response":
      return lead.firstResponseAt ? null : lead.createdAt;
    case "next_followup":
      if (!lead.nextFollowupAt) return null;
      return lead.nextFollowupAt < now ? lead.nextFollowupAt : null;
    case "in_stage":
      return currentStageEnteredAt;
  }
}

/**
 * Evaluates one lead against active `sla_policies` in priority order and
 * returns the first one whose `applies_to` conditions match — same
 * condition grammar and evaluator as the assignment engine
 * (docs/01-DATA-MODEL.md § SLA policies: "same condition grammar").
 * Highest `priority` number wins first (docs/01-DATA-MODEL.md § SLA
 * policies, line "Highest priority whose applies_to matches wins" —
 * the OPPOSITE convention from assignment_rules' "lower number = higher
 * priority," matching the settings screen's own descending priority
 * display for both sla_policies and temperature_rules). A lead nothing
 * applies to (or whose one matching policy's measure doesn't currently
 * apply — see measureBaseline) is never breached.
 */
export function evaluateLeadSla(input: SlaEvaluationInput): SlaEvaluationResult {
  const sorted = [...input.policies].sort((a, b) => b.priority - a.priority);

  for (const policy of sorted) {
    if (!evaluateConditions((policy.appliesTo as RuleConditions | null) ?? {}, input.lead)) continue;

    const baseline = measureBaseline(policy, input.lead, input.currentStageEnteredAt, input.now);
    if (baseline === null) continue;

    const elapsedHours = policy.businessHoursOnly
      ? computeBusinessHoursElapsed(baseline, input.now, input.businessHours, input.holidayDates, input.timeZone)
      : (input.now.getTime() - baseline.getTime()) / (1000 * 60 * 60);

    return { policyId: policy.id, breached: elapsedHours >= policy.targetHours, elapsedHours };
  }

  return { policyId: null, breached: false, elapsedHours: 0 };
}
