import type { leads } from "@/lib/db/schema";

type Lead = typeof leads.$inferSelect;

/**
 * Whitelisted mapping from a condition's `field` name to an actual lead
 * column — docs/01-DATA-MODEL.md § Assignment rules engine: "Fields are a
 * whitelisted map to lead columns — never raw SQL." Extend this map, not
 * the evaluator, when a rule needs to target a new field.
 *
 * "source"/"sub_source" resolve to the *last*-touch attribution: a rule
 * re-evaluated on update (applies_on includes 'update') should react to the
 * most recent touch, and for a brand new lead first-touch and last-touch
 * are identical anyway.
 */
const FIELD_MAP = {
  district: "district",
  city: "city",
  state: "state",
  source: "lastTouchSource",
  sub_source: "lastTouchSubSource",
  campaign: "lastTouchCampaign",
  exam_year: "examYear",
  center_id: "centerId",
  temperature: "temperature",
  interested_exams: "interestedExams",
  courses_interested: "coursesInterested",
  preferred_mode: "preferredMode",
} as const satisfies Record<string, keyof Lead>;

export type ConditionField = keyof typeof FIELD_MAP;

export const CONDITION_OPS = [
  "equals",
  "not_equals",
  "in",
  "not_in",
  "contains",
  "is_empty",
  "is_not_empty",
  "gt",
  "lt",
  "between",
] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export interface Condition {
  field: ConditionField;
  op: ConditionOp;
  value?: unknown;
}

/** `{ all: [...] }` — an AND-array of predicates. No OR grammar yet (none in the data model spec). */
export interface RuleConditions {
  all?: Condition[];
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function toComparable(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function evaluateOne(condition: Condition, lead: Lead): boolean {
  const column = FIELD_MAP[condition.field];
  if (!column) {
    throw new Error(`evaluateConditions: unknown field "${condition.field}"`);
  }
  const leadValue = lead[column];

  switch (condition.op) {
    case "is_empty":
      return isEmpty(leadValue);
    case "is_not_empty":
      return !isEmpty(leadValue);
    case "equals":
      return leadValue === condition.value;
    case "not_equals":
      return leadValue !== condition.value;
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(leadValue);
    case "not_in":
      return Array.isArray(condition.value) && !condition.value.includes(leadValue);
    case "contains":
      if (Array.isArray(leadValue)) return leadValue.some((item) => item === condition.value);
      if (typeof leadValue === "string" && typeof condition.value === "string") {
        return leadValue.toLowerCase().includes(condition.value.toLowerCase());
      }
      return false;
    case "gt": {
      const a = toComparable(leadValue);
      const b = toComparable(condition.value);
      return a !== null && b !== null && a > b;
    }
    case "lt": {
      const a = toComparable(leadValue);
      const b = toComparable(condition.value);
      return a !== null && b !== null && a < b;
    }
    case "between": {
      const a = toComparable(leadValue);
      if (a === null || !Array.isArray(condition.value) || condition.value.length !== 2) return false;
      const [min, max] = condition.value.map(toComparable);
      return min !== null && max !== null && a >= min && a <= max;
    }
    default:
      return false;
  }
}

/**
 * True if every predicate in `conditions.all` matches `lead`. An empty or
 * missing `all` array matches everything — a rule with no conditions is a
 * deliberate catch-all, not a no-op (useful as a lowest-priority default).
 */
export function evaluateConditions(conditions: RuleConditions, lead: Lead): boolean {
  const predicates = conditions.all ?? [];
  return predicates.every((condition) => evaluateOne(condition, lead));
}
