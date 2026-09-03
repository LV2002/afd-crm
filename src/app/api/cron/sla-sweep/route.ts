import { desc, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { businessHours, centers, holidays, leads, pipelineStages, slaPolicies, stageHistory } from "@/lib/db/schema";
import type { DayHours } from "@/lib/sla/business-hours";
import { dueEscalations, policyEscalationSteps } from "@/lib/sla/escalations";
import { evaluateLeadSla } from "@/lib/sla/evaluate-sla";
import { notify } from "@/lib/notifications/notify";

export const dynamic = "force-dynamic";

/**
 * docs/02-BUILD-PHASES.md § Phase 2: "SLA cron: evaluates sla_policies per
 * lead, honours business hours, ... flags breaches." Runs on the direct db
 * client (same trust model as resolveOrCreateLead()/applyAssignment() —
 * see docs/DECISIONS.md), never reachable by a browser session: guarded by
 * CRON_SECRET, which only Vercel's own cron invocation (configured in
 * vercel.json) and a manually-authorized call know.
 *
 * The escalation ladder is live: `notify_roles`, `notify_owner` and
 * `unassign` all take effect, and `flag_breach` is delivered by setting
 * `sla_breached`. `requeue` is still not implemented, deliberately — the
 * data model defines no queue for it to mean anything against, and a
 * switch that silently does nothing is exactly what this sweep spent
 * months being. When a queue exists, this is where it goes.
 *
 * A rung fires once, not every hour: `leads.sla_escalated_at_hours` records
 * the highest rung already reached, and clears when the SLA clears.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const [activeLeads, activePolicies, stageRows, businessHourRows, holidayRows, centerRows] = await Promise.all([
    db.select().from(leads).where(isNull(leads.deletedAt)),
    db.select().from(slaPolicies).where(isNull(slaPolicies.deletedAt)),
    db.select({ id: pipelineStages.id, stageType: pipelineStages.stageType }).from(pipelineStages),
    db.select().from(businessHours),
    db.select().from(holidays),
    db.select({ id: centers.id, name: centers.name, timezone: centers.timezone }).from(centers),
  ]);

  const enabledPolicies = activePolicies.filter((p) => p.isActive);

  const terminalStageIds = new Set(
    stageRows.filter((s) => s.stageType === "won" || s.stageType === "lost").map((s) => s.id),
  );

  const businessHoursByCenter = new Map<string, DayHours[]>();
  for (const row of businessHourRows) {
    const list = businessHoursByCenter.get(row.centerId) ?? [];
    list.push({
      dayOfWeek: row.dayOfWeek,
      opensAt: row.opensAt,
      closesAt: row.closesAt,
      isClosed: row.isClosed,
    });
    businessHoursByCenter.set(row.centerId, list);
  }

  const holidaysByCenter = new Map<string, Set<string>>();
  for (const row of holidayRows) {
    const set = holidaysByCenter.get(row.centerId) ?? new Set<string>();
    set.add(row.date);
    holidaysByCenter.set(row.centerId, set);
  }

  const timeZoneByCenter = new Map(centerRows.map((c) => [c.id, c.timezone]));

  const evaluableLeads = activeLeads.filter((lead) => !lead.stageId || !terminalStageIds.has(lead.stageId));
  const leadIds = evaluableLeads.map((lead) => lead.id);

  // Only the most recent stage_history row per lead is needed (when it
  // entered its *current* stage) — fetched newest-first and the first hit
  // per lead id kept, cheaper than a per-lead query for AFD's actual
  // volume (~200 leads/month, see docs/DECISIONS.md's export-guard note
  // for the same reasoning applied elsewhere).
  const stageHistoryRows =
    leadIds.length > 0
      ? await db
          .select({ leadId: stageHistory.leadId, changedAt: stageHistory.changedAt })
          .from(stageHistory)
          .where(inArray(stageHistory.leadId, leadIds))
          .orderBy(desc(stageHistory.changedAt))
      : [];
  const stageEnteredAtByLead = new Map<string, Date>();
  for (const row of stageHistoryRows) {
    if (!stageEnteredAtByLead.has(row.leadId)) {
      stageEnteredAtByLead.set(row.leadId, row.changedAt);
    }
  }

  const toBreach: string[] = [];
  const toClear: string[] = [];
  let breachedCount = 0;

  const policyById = new Map(enabledPolicies.map((p) => [p.id, p]));
  const centerNameById = new Map(centerRows.map((c) => [c.id, c.name]));

  /** Which policy breached a lead, and by how much — for the breach copy. */
  const breachPolicyName = new Map<string, string>();
  const breachHoursOverdue = new Map<string, number>();

  /** Escalations to deliver after the status writes, so the ladder never blocks them. */
  const pendingEscalations: Array<{
    lead: (typeof evaluableLeads)[number];
    policyName: string;
    atHours: number;
    notifyRoles: string[];
    notifyOwner: boolean;
    unassign: boolean;
  }> = [];

  for (const lead of evaluableLeads) {
    const timeZone = (lead.centerId && timeZoneByCenter.get(lead.centerId)) || "Asia/Kolkata";
    const centerBusinessHours = (lead.centerId && businessHoursByCenter.get(lead.centerId)) || [];
    const centerHolidays = (lead.centerId && holidaysByCenter.get(lead.centerId)) || new Set<string>();
    const stageEnteredAt = stageEnteredAtByLead.get(lead.id) ?? lead.createdAt;

    const result = evaluateLeadSla({
      lead,
      policies: enabledPolicies,
      currentStageEnteredAt: stageEnteredAt,
      businessHours: centerBusinessHours,
      holidayDates: centerHolidays,
      timeZone,
      now,
    });

    if (result.breached) {
      breachedCount++;
      const policy = result.policyId ? policyById.get(result.policyId) : undefined;
      if (policy) {
        breachPolicyName.set(lead.id, policy.name);
        breachHoursOverdue.set(lead.id, Math.max(0, result.elapsedHours - policy.targetHours));
      }
    }

    if (result.breached && !lead.slaBreached) {
      toBreach.push(lead.id);
    } else if (!result.breached && lead.slaBreached) {
      toClear.push(lead.id);
    }

    // The ladder only climbs while the lead is actually breaching. A lead
    // that has been worked has no rungs due, and clearing the record below
    // means one that goes bad again starts from the bottom.
    if (result.breached && result.policyId) {
      const policy = policyById.get(result.policyId);
      const steps = policyEscalationSteps(policy?.escalations);
      const due = dueEscalations(steps, result.elapsedHours, lead.slaEscalatedAtHours);
      for (const step of due) {
        pendingEscalations.push({
          lead,
          policyName: policy?.name ?? "SLA",
          atHours: step.atHours,
          notifyRoles: step.notifyRoles,
          notifyOwner: step.notifyOwner,
          unassign: step.unassign,
        });
      }
    }
  }

  if (toBreach.length > 0) {
    await db.update(leads).set({ slaBreached: true }).where(inArray(leads.id, toBreach));
  }
  if (toClear.length > 0) {
    // Clearing the rung too: a lead that was rescued and later goes bad
    // again deserves the ladder from the bottom, not silence because it
    // once reached 72 hours.
    await db
      .update(leads)
      .set({ slaBreached: false, slaEscalatedAtHours: null })
      .where(inArray(leads.id, toClear));
  }

  // Newly breached leads get the plain breach notification. Only NEW ones:
  // a lead that has been breaching for a week is not news every hour.
  for (const leadId of toBreach) {
    const lead = evaluableLeads.find((l) => l.id === leadId);
    if (!lead) continue;
    await notify({
      eventKey: "lead.sla_breached",
      context: {
        lead_name: lead.studentName,
        lead_number: lead.leadNumber,
        policy_name: breachPolicyName.get(lead.id) ?? "SLA",
        hours_overdue: Math.round(breachHoursOverdue.get(lead.id) ?? 0),
        center_name: lead.centerId ? centerNameById.get(lead.centerId) : null,
      },
      href: `/leads/${lead.id}`,
      entityType: "leads",
      entityId: lead.id,
      centerId: lead.centerId,
      ownerId: lead.assignedTo,
    });
  }

  let escalated = 0;
  let unassigned = 0;
  for (const step of pendingEscalations) {
    const { lead } = step;

    await notify({
      eventKey: "lead.sla_escalated",
      context: {
        lead_name: lead.studentName,
        lead_number: lead.leadNumber,
        policy_name: step.policyName,
        at_hours: step.atHours,
        center_name: lead.centerId ? centerNameById.get(lead.centerId) : null,
      },
      href: `/leads/${lead.id}`,
      entityType: "leads",
      entityId: lead.id,
      centerId: lead.centerId,
      ownerId: lead.assignedTo,
      overrideRoles: step.notifyRoles,
      overrideNotifyOwner: step.notifyOwner,
    });

    // Recorded even when the notification reached nobody. The rung has
    // been climbed either way, and re-firing it every hour because no role
    // was configured would be the worse failure.
    await db
      .update(leads)
      .set({
        slaEscalatedAtHours: step.atHours,
        // `unassign` sends the lead back to the orphan queue, which is
        // where a centre head picks up work nobody is doing.
        ...(step.unassign ? { assignedTo: null } : {}),
      })
      .where(eq(leads.id, lead.id));

    escalated += 1;
    if (step.unassign) unassigned += 1;
  }

  return NextResponse.json({
    evaluated: evaluableLeads.length,
    breached: breachedCount,
    newlyBreached: toBreach.length,
    cleared: toClear.length,
    escalated,
    unassigned,
  });
}
