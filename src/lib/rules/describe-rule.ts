import type { Condition, ConditionOp, RuleConditions } from "@/lib/assignment/evaluate-conditions";
import { CONDITION_FIELDS, VALUELESS_OPS } from "@/lib/rules/condition-fields";

/**
 * Saying a rule back in English.
 *
 * A rules engine that stores JSONB is the right design and the wrong thing
 * to show anybody. The settings screen and the audit trail both print
 * these sentences instead, so somebody can read "Kannur + Meta + NIFT →
 * Athira" off the page and tell whether it is what they meant.
 *
 * Pure and label-driven: the caller passes a lookup for centre and user
 * ids, because this module knows nothing about the database.
 */

export type LabelLookup = (kind: "center" | "user" | "option", value: string) => string;

const IDENTITY: LabelLookup = (_kind, value) => value;

export const OP_VERBS: Record<ConditionOp, string> = {
  equals: "is",
  not_equals: "is not",
  in: "is any of",
  not_in: "is none of",
  contains: "includes",
  is_empty: "is blank",
  is_not_empty: "is filled in",
  gt: "is more than",
  lt: "is less than",
  between: "is between",
};

export function describeCondition(condition: Condition, label: LabelLookup = IDENTITY): string {
  const meta = CONDITION_FIELDS[condition.field];
  const name = meta?.label ?? condition.field;
  const verb = OP_VERBS[condition.op] ?? condition.op;

  if (VALUELESS_OPS.includes(condition.op)) return `${name} ${verb}`;

  const kind = condition.field === "center_id" ? "center" : "option";
  const render = (value: unknown) => label(kind, String(value));

  if (Array.isArray(condition.value)) {
    const parts = condition.value.map(render);
    if (condition.op === "between" && parts.length === 2) {
      return `${name} ${verb} ${parts[0]} and ${parts[1]}`;
    }
    return `${name} ${verb} ${joinList(parts)}`;
  }

  return `${name} ${verb} ${render(condition.value)}`;
}

/** Every predicate, joined — an empty rule is a deliberate catch-all and says so. */
export function describeConditions(conditions: RuleConditions, label: LabelLookup = IDENTITY): string {
  const predicates = conditions.all ?? [];
  if (predicates.length === 0) return "Every lead";
  return predicates.map((condition) => describeCondition(condition, label)).join(", and ");
}

export interface DescribableAction {
  strategy?: string;
  assignTo?: string;
  userIds?: string[];
  centerId?: string;
  cursor?: number;
}

export function describeAction(action: DescribableAction, label: LabelLookup = IDENTITY): string {
  const moveTo = action.centerId ? `, and move them to ${label("center", action.centerId)}` : "";

  if (action.strategy === "fixed" && action.assignTo) {
    return `Assign to ${label("user", action.assignTo)}${moveTo}`;
  }

  if (action.strategy === "round_robin") {
    const names = (action.userIds ?? []).map((id) => label("user", id));
    if (names.length === 0) return `Share out between nobody — this rule assigns nothing${moveTo}`;
    if (names.length === 1) return `Assign to ${names[0]}${moveTo}`;
    return `Share out in turn between ${joinList(names)}${moveTo}`;
  }

  return "Does nothing — the action is not one this system knows how to run";
}

/** "a, b and c" — an Oxford-comma-free list, because it is read aloud off a screen. */
function joinList(parts: string[]): string {
  if (parts.length === 0) return "nothing";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
