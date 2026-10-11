import { and, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cron/require-secret";
import { reportingFailures } from "@/lib/errors/capture";

import { db } from "@/lib/db/client";
import { leads, temperatureRules } from "@/lib/db/schema";
import { indexByValue } from "@/lib/leads/temperature-kinds";
import { loadTemperatureOptionsDirect } from "@/lib/leads/temperature-options-direct";
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
async function run(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const now = new Date();

  const [activeLeads, activeRules, temperatureOptions] = await Promise.all([
    db.select().from(leads).where(isNull(leads.deletedAt)),
    db.select().from(temperatureRules).where(isNull(temperatureRules.deletedAt)),
    loadTemperatureOptionsDirect(),
  ]);

  const optionByValue = indexByValue(temperatureOptions);

  /*
    Rules re-grade a lead that is BEING WORKED, and nothing else.

    Temperature used to be a dimension of its own, so a rule could safely
    write any of its four values. It is now the whole status, and a rule
    must not be able to do what a status change by hand cannot:

    - It never TOUCHES a lead that is Not contacted, parked, won or lost.
      "Hot" written over "Not contacted" would claim a conversation that
      never happened; written over "Took admission" it is refused by the
      database and would take the whole batch down with it; written over
      "Negative" it would resurrect a lead somebody deliberately closed.
    - It never PRODUCES anything but an in-progress value, for the same
      reason from the other side: a rule that wrote "Negative" would need
      a lost reason it cannot supply, and one that wrote "Took admission"
      would need an admission.

    A rule whose value is not in-progress is ignored here rather than
    failing the run, and the settings screen only offers in-progress values
    when writing one.
  */
  const enabledRules = activeRules.filter(
    (r) => {
      const target = optionByValue.get(r.temperatureValue);
      return r.isActive && target?.kind === "open" && target.isActive;
    },
  );

  let evaluated = 0;
  let skippedOverride = 0;
  // Grouped by the new temperature value, not one UPDATE per lead — a
  // handful of distinct values (Hot/Warm/Cold/Dead) covers however many
  // leads changed, same batching idea as the SLA sweep's toBreach/toClear.
  const leadIdsByNewValue = new Map<string, string[]>();

  for (const lead of activeLeads) {
    // An unclassified lead (no status at all) is exactly what a rule is for.
    // One carrying a value that is not in the list at all is left alone: it
    // is somebody's data, and guessing what it means is how it gets lost.
    if (lead.temperature !== null && optionByValue.get(lead.temperature)?.kind !== "open") continue;

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

/**
 * Wrapped so a failure is recorded and emailed rather than disappearing
 * into a 500 that nobody looks at. It re-throws afterwards on purpose:
 * the platform's own retry and alerting depend on the route genuinely
 * failing, and swallowing it here would make a broken job look healthy.
 */
export async function GET(request: Request) {
  return reportingFailures("cron:recompute-temperature", () => run(request));
}
