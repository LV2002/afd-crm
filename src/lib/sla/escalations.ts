/**
 * The escalation ladder on an SLA policy, read as data.
 *
 * `sla_policies.escalations` is a JSONB array an admin edits in Settings →
 * SLA Policies. It has been storable, editable and completely inert since
 * Phase 2, because there was nothing to notify through. This module is the
 * parsing half of making it real; the sweep does the acting.
 *
 * Pure, so the "which rungs are due, and which have already fired" logic —
 * the part that decides whether a centre head is woken once or every hour
 * — is testable without a database or a clock.
 */

export interface EscalationStep {
  /** Hours past the target at which this rung comes due. */
  atHours: number;
  /** Role ids to notify at this rung. Empty falls back to the event's configured roles. */
  notifyRoles: string[];
  /** Also notify the lead's owner at this rung. */
  notifyOwner: boolean;
  /** Take the lead off its owner, sending it to the orphan queue. */
  unassign: boolean;
}

/**
 * Reads one rung out of the stored JSON, tolerantly.
 *
 * The array is hand-edited configuration, so a missing or mistyped key is
 * a real possibility and must not throw in a cron job that is halfway
 * through a sweep. Anything unreadable yields null and is skipped.
 */
export function parseEscalationStep(raw: unknown): EscalationStep | null {
  if (!raw || typeof raw !== "object") return null;
  const step = raw as Record<string, unknown>;

  const atHours = Number(step.at_hours);
  if (!Number.isFinite(atHours) || atHours < 0) return null;

  const notifyRoles = Array.isArray(step.notify_roles)
    ? step.notify_roles.filter((r): r is string => typeof r === "string")
    : [];

  return {
    atHours,
    notifyRoles,
    notifyOwner: step.notify_owner === true,
    unassign: step.unassign === true,
  };
}

/**
 * The rungs that have come due and not yet fired, in ladder order.
 *
 * `alreadyFiredUpTo` is the highest `at_hours` this lead has already been
 * escalated to (`leads.sla_escalated_at_hours`). Without it, a sweep
 * running hourly would notify the same centre head about the same lead
 * every hour until somebody touched it — which trains people to ignore
 * notifications, and is worse than not having them.
 *
 * When several rungs come due at once — a lead untouched over a weekend
 * crossing the 24h, 48h and 72h rungs — only the highest is returned. The
 * lower rungs are already implied by it, and three messages about one lead
 * says nothing the last one doesn't.
 */
export function dueEscalations(
  steps: EscalationStep[],
  elapsedHours: number,
  alreadyFiredUpTo: number | null,
): EscalationStep[] {
  const floor = alreadyFiredUpTo ?? -1;
  const due = steps
    .filter((step) => step.atHours <= elapsedHours && step.atHours > floor)
    .sort((a, b) => a.atHours - b.atHours);

  return due.length > 0 ? [due[due.length - 1]] : [];
}

/** All readable rungs on a policy, ladder order. */
export function policyEscalationSteps(raw: unknown): EscalationStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(parseEscalationStep)
    .filter((step): step is EscalationStep => step !== null)
    .sort((a, b) => a.atHours - b.atHours);
}
