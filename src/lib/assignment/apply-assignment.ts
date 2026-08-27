import { and, desc, eq, isNull } from "drizzle-orm";

import { db, type DbExecutor } from "@/lib/db/client";
import { assignmentHistory, assignmentRules, leads, profiles } from "@/lib/db/schema";

import { evaluateConditions, type RuleConditions } from "./evaluate-conditions";

type Lead = typeof leads.$inferSelect;

interface FixedAction {
  strategy: "fixed";
  assignTo: string;
  centerId?: string;
}

interface RoundRobinAction {
  strategy: "round_robin";
  userIds: string[];
  centerId?: string;
  cursor?: number;
}

type RuleAction = FixedAction | RoundRobinAction;

export interface ApplyAssignmentResult {
  matched: boolean;
  ruleId: string | null;
  assignedTo: string | null;
  centerId: string | null;
}

/**
 * Picks the next active user starting at `cursor`, wrapping around the
 * list once. Returns null (never assigns to an on-leave/deactivated user)
 * if nobody in the list is active. `profiles.is_active` is the only
 * availability signal that exists today — there's no separate "on leave"
 * flag (docs/01-DATA-MODEL.md doesn't define one); see docs/DECISIONS.md.
 */
async function pickRoundRobinUser(
  tx: DbExecutor,
  userIds: string[],
  cursor: number,
): Promise<{ userId: string; nextCursor: number } | null> {
  if (userIds.length === 0) return null;

  const activeRows = await tx
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.isActive, true));
  const activeIds = new Set(activeRows.map((r) => r.id));

  for (let i = 0; i < userIds.length; i++) {
    const index = (cursor + i) % userIds.length;
    const candidate = userIds[index];
    if (activeIds.has(candidate)) {
      return { userId: candidate, nextCursor: (index + 1) % userIds.length };
    }
  }
  return null;
}

/**
 * The one place assignment actually happens (CLAUDE.md non-negotiable #4:
 * assignment is a rules engine). Evaluates active assignment_rules in
 * ascending priority order (lower number = higher priority, same
 * convention as pipeline_stages.sort_order) and applies the action of the
 * first one whose conditions match. Writes assignment_history for the
 * match; a lead that matches nothing is left exactly as it was — Phase 2's
 * orphan queue is what surfaces those, not this function.
 *
 * Takes a `DbExecutor` rather than owning a transaction itself: `db`'s
 * connection pool is `max: 1`, so this must run inside the *caller's*
 * transaction (resolveOrCreateLead's, today) rather than opening a second
 * one, which would deadlock. A standalone caller should wrap its own call
 * in `db.transaction(tx => applyAssignment(tx, leadId))`.
 */
export async function applyAssignment(
  tx: DbExecutor,
  leadId: string,
  options: { trigger?: "create" | "update" } = {},
): Promise<ApplyAssignmentResult> {
  const trigger = options.trigger ?? "create";

  const [lead] = await tx.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) throw new Error(`applyAssignment: lead ${leadId} not found`);

  const rules = await tx
    .select()
    .from(assignmentRules)
    .where(and(eq(assignmentRules.isActive, true), isNull(assignmentRules.deletedAt)))
    .orderBy(assignmentRules.priority);

  for (const rule of rules) {
    if (!rule.appliesOn.includes(trigger)) continue;
    if (!evaluateConditions(rule.conditions as RuleConditions, lead)) continue;

    const action = rule.action as unknown as RuleAction;
    let assignedTo: string | null = null;

    if (action.strategy === "fixed") {
      assignedTo = action.assignTo;
    } else if (action.strategy === "round_robin") {
      // Lock the rule row so two concurrent calls can't pick the same
      // "next" user off the same cursor. Only holds for real inside an
      // actual transaction, which is the contract callers must uphold.
      const [locked] = await tx
        .select()
        .from(assignmentRules)
        .where(eq(assignmentRules.id, rule.id))
        .for("update");
      const currentCursor = (locked.action as unknown as RoundRobinAction).cursor ?? 0;
      const picked = await pickRoundRobinUser(tx, action.userIds, currentCursor);
      if (!picked) continue; // whole list is inactive/on-leave -- fall through to the next rule
      assignedTo = picked.userId;
      await tx
        .update(assignmentRules)
        .set({ action: { ...action, cursor: picked.nextCursor } })
        .where(eq(assignmentRules.id, rule.id));
    } else {
      continue;
    }

    const centerId = action.centerId ?? lead.centerId;

    await tx.update(leads).set({ assignedTo, centerId }).where(eq(leads.id, leadId));

    await tx.insert(assignmentHistory).values({
      leadId,
      fromUser: lead.assignedTo,
      toUser: assignedTo,
      fromCenter: lead.centerId,
      toCenter: centerId,
      ruleId: rule.id,
      reason: action.strategy === "round_robin" ? "round_robin" : "rule",
      actorId: null,
    });

    return { matched: true, ruleId: rule.id, assignedTo, centerId };
  }

  return { matched: false, ruleId: null, assignedTo: lead.assignedTo, centerId: lead.centerId };
}

export interface DryRunResult {
  matched: number;
  sampled: number;
}

/**
 * "This rule would have matched 43 of the last 200 leads" (data model spec)
 * — evaluates a candidate (possibly not-yet-saved) condition set against
 * the most recent leads, without touching any row. Used by the rule
 * builder's preview before an admin activates a new/edited rule. Read-only,
 * so unlike applyAssignment() it's fine to always run against the
 * top-level `db`.
 */
export async function dryRunRule(
  conditions: RuleConditions,
  options: { sampleSize?: number } = {},
): Promise<DryRunResult> {
  const sampleSize = options.sampleSize ?? 200;
  const sample: Lead[] = await db
    .select()
    .from(leads)
    .where(isNull(leads.deletedAt))
    .orderBy(desc(leads.createdAt))
    .limit(sampleSize);

  const matched = sample.filter((lead) => evaluateConditions(conditions, lead)).length;
  return { matched, sampled: sample.length };
}
