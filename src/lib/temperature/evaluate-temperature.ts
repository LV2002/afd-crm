import { evaluateConditions, type RuleConditions } from "@/lib/assignment/evaluate-conditions";
import type { leads, temperatureRules } from "@/lib/db/schema";

type Lead = typeof leads.$inferSelect;
type TemperatureRuleRow = typeof temperatureRules.$inferSelect;

export interface TemperatureEvaluationResult {
  ruleId: string | null;
  /** The temperature value to set, or null if nothing matched — the lead keeps its current value. */
  temperatureValue: string | null;
}

/**
 * docs/01-DATA-MODEL.md § Temperature: "First match by priority wins" —
 * same condition grammar and evaluator as the assignment engine and the
 * SLA sweep, reused rather than reimplemented a third time.
 *
 * A manual override (`leads.temperature_override_until` in the future)
 * must be checked by the caller BEFORE calling this — it's not part of
 * the evaluation itself, since "don't touch this lead at all right now"
 * is a different thing from "no rule happened to match."
 */
export function evaluateLeadTemperature(
  lead: Lead,
  rules: TemperatureRuleRow[],
): TemperatureEvaluationResult {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);

  for (const rule of sorted) {
    if (evaluateConditions(rule.conditions as RuleConditions, lead)) {
      return { ruleId: rule.id, temperatureValue: rule.temperatureValue };
    }
  }

  return { ruleId: null, temperatureValue: null };
}
