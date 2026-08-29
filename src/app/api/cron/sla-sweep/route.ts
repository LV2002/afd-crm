import { desc, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { businessHours, centers, holidays, leads, pipelineStages, slaPolicies, stageHistory } from "@/lib/db/schema";
import type { DayHours } from "@/lib/sla/business-hours";
import { evaluateLeadSla } from "@/lib/sla/evaluate-sla";

export const dynamic = "force-dynamic";

/**
 * docs/02-BUILD-PHASES.md § Phase 2: "SLA cron: evaluates sla_policies per
 * lead, honours business hours, ... flags breaches." Runs on the direct db
 * client (same trust model as resolveOrCreateLead()/applyAssignment() —
 * see docs/DECISIONS.md), never reachable by a browser session: guarded by
 * CRON_SECRET, which only Vercel's own cron invocation (configured in
 * vercel.json) and a manually-authorized call know.
 *
 * Deliberately does NOT run the escalation ladder's notify_roles/
 * notify_owner/unassign/requeue side effects yet — there's no
 * `notifications` table to notify through (same gap already noted for the
 * assignment engine, docs/PROGRESS.md). `flag_breach` is the one escalation
 * action this sweep already delivers, since that's exactly what setting
 * `sla_breached` is. See docs/DECISIONS.md.
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
    db.select({ id: centers.id, timezone: centers.timezone }).from(centers),
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

    if (result.breached) breachedCount++;

    if (result.breached && !lead.slaBreached) {
      toBreach.push(lead.id);
    } else if (!result.breached && lead.slaBreached) {
      toClear.push(lead.id);
    }
  }

  if (toBreach.length > 0) {
    await db.update(leads).set({ slaBreached: true }).where(inArray(leads.id, toBreach));
  }
  if (toClear.length > 0) {
    await db.update(leads).set({ slaBreached: false }).where(inArray(leads.id, toClear));
  }

  return NextResponse.json({
    evaluated: evaluableLeads.length,
    breached: breachedCount,
    newlyBreached: toBreach.length,
    cleared: toClear.length,
  });
}
