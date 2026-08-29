import { and, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { leads, pipelineStages, temperatureRules } from "@/lib/db/schema";
import { evaluateLeadTemperature } from "@/lib/temperature/evaluate-temperature";

export const dynamic = "force-dynamic";

/**
 * docs/02-BUILD-PHASES.md § Phase 2 / docs/01-DATA-MODEL.md § Temperature:
 * "Evaluated nightly and on activity." This is the nightly half — an
 * on-write recompute (right after logging an interaction, say) is real
 * additional work this pass doesn't attempt; see docs/DECISIONS.md.
 *
 * Same trust model, auth, and direct-db-client pattern as
 * /api/cron/sla-sweep — see that route for the reasoning, not repeated
 * here.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const [activeLeads, activeRules, stageRows] = await Promise.all([
    db.select().from(leads).where(isNull(leads.deletedAt)),
    db.select().from(temperatureRules).where(isNull(temperatureRules.deletedAt)),
    db.select({ id: pipelineStages.id, stageType: pipelineStages.stageType }).from(pipelineStages),
  ]);

  const enabledRules = activeRules.filter((r) => r.isActive);
  const terminalStageIds = new Set(
    stageRows.filter((s) => s.stageType === "won" || s.stageType === "lost").map((s) => s.id),
  );

  let evaluated = 0;
  let skippedOverride = 0;
  // Grouped by the new temperature value, not one UPDATE per lead — a
  // handful of distinct values (Hot/Warm/Cold/Dead) covers however many
  // leads changed, same batching idea as the SLA sweep's toBreach/toClear.
  const leadIdsByNewValue = new Map<string, string[]>();

  for (const lead of activeLeads) {
    if (lead.stageId && terminalStageIds.has(lead.stageId)) continue;

    // "leads.temperature_override_until still wins over any rule while it
    // is in the future — a counsellor's manual judgement beats the engine"
    // (docs/01-DATA-MODEL.md § Temperature). Not part of evaluateLeadTemperature
    // itself, same separation as the SLA sweep keeping its own filters
    // outside evaluateLeadSla.
    if (lead.temperatureOverrideUntil && lead.temperatureOverrideUntil > now) {
      skippedOverride++;
      continue;
    }

    evaluated++;
    const result = evaluateLeadTemperature(lead, enabledRules);

    if (result.temperatureValue !== null && result.temperatureValue !== lead.temperature) {
      const ids = leadIdsByNewValue.get(result.temperatureValue) ?? [];
      ids.push(lead.id);
      leadIdsByNewValue.set(result.temperatureValue, ids);
    }
  }

  let changed = 0;
  for (const [temperatureValue, leadIds] of leadIdsByNewValue) {
    await db
      .update(leads)
      .set({ temperature: temperatureValue, temperatureSetBy: "rule" })
      .where(and(inArray(leads.id, leadIds), isNull(leads.deletedAt)));
    changed += leadIds.length;
  }

  return NextResponse.json({ evaluated, changed, skippedOverride });
}
