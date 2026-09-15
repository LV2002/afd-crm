import {
  CONDITION_OPS,
  type Condition,
  type ConditionField,
  type ConditionOp,
  type RuleConditions,
} from "@/lib/assignment/evaluate-conditions";
import { CONDITION_FIELDS, CONDITION_FIELD_KEYS, VALUELESS_OPS } from "@/lib/rules/condition-fields";
import { OP_VERBS } from "@/lib/rules/describe-rule";

/**
 * Validating what a browser posted before it is written as JSONB.
 *
 * The builder sends conditions as JSON in a hidden input, which means the
 * server must treat them as it would any other request body — an unknown
 * field name here would reach `evaluateConditions` and throw on every
 * single lead the moment the rule is active, at ingestion time, where
 * nobody is watching. So: known fields only, known operators only, and a
 * value where the operator needs one.
 */
export function parseConditions(
  raw: unknown,
): { ok: true; value: RuleConditions } | { ok: false; error: string } {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return { ok: true, value: { all: [] } };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: "Conditions were not valid JSON." };
    }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Conditions must be an object." };
  }

  const all = (parsed as { all?: unknown }).all ?? [];
  if (!Array.isArray(all)) return { ok: false, error: "Conditions must be a list." };

  const conditions: Condition[] = [];
  for (const entry of all) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, error: "Every condition must be an object." };
    }
    const { field, op, value } = entry as { field?: unknown; op?: unknown; value?: unknown };

    if (typeof field !== "string" || !CONDITION_FIELD_KEYS.includes(field as ConditionField)) {
      return { ok: false, error: `"${String(field)}" is not a field a rule can test.` };
    }
    if (typeof op !== "string" || !CONDITION_OPS.includes(op as ConditionOp)) {
      return { ok: false, error: `"${String(op)}" is not an operator this system knows.` };
    }

    const typedOp = op as ConditionOp;
    if (!VALUELESS_OPS.includes(typedOp)) {
      const empty =
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0);
      if (empty) {
        return {
          ok: false,
          error: `"${CONDITION_FIELDS[field as ConditionField].label} ${OP_VERBS[typedOp]}" needs a value.`,
        };
      }
      if (typedOp === "between" && (!Array.isArray(value) || value.length !== 2)) {
        return { ok: false, error: "A between condition needs exactly two values." };
      }
      conditions.push({ field: field as ConditionField, op: typedOp, value });
    } else {
      conditions.push({ field: field as ConditionField, op: typedOp });
    }
  }

  return { ok: true, value: { all: conditions } };
}

export interface ParsedAction {
  strategy: "fixed" | "round_robin";
  assignTo?: string;
  userIds?: string[];
  centerId?: string;
}

/**
 * The other half: who the rule assigns to.
 *
 * A rule whose action names nobody is worse than no rule — it matches,
 * consumes the lead, and assigns it to nothing, so the lead never reaches
 * a lower-priority rule that would have caught it. That is the v1 failure
 * mode all over again (unassigned leads from the highest-volume source),
 * so an empty action is rejected here rather than saved and discovered in
 * a month.
 *
 * `cursor` is deliberately not accepted from a form: it is round-robin's
 * running position, owned by `applyAssignment`, and an editor that posted
 * it back would reset the rotation on every save.
 */
export function parseAction(
  strategy: unknown,
  assignTo: unknown,
  userIds: unknown,
  centerId: unknown,
): { ok: true; value: ParsedAction } | { ok: false; error: string } {
  const center = typeof centerId === "string" && centerId.trim() ? centerId.trim() : undefined;

  if (strategy === "fixed") {
    if (typeof assignTo !== "string" || !assignTo.trim()) {
      return { ok: false, error: "Choose the person this rule assigns to." };
    }
    return { ok: true, value: { strategy: "fixed", assignTo: assignTo.trim(), centerId: center } };
  }

  if (strategy === "round_robin") {
    const ids = (Array.isArray(userIds) ? userIds : [userIds])
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      .map((id) => id.trim());
    const unique = [...new Set(ids)];
    if (unique.length < 2) {
      return {
        ok: false,
        error: "Sharing out in turn needs at least two people — otherwise assign to one person.",
      };
    }
    return { ok: true, value: { strategy: "round_robin", userIds: unique, centerId: center } };
  }

  return { ok: false, error: "Choose how this rule assigns the lead." };
}
