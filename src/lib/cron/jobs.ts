import "server-only";

import { expectOk, type NightlyJob } from "@/lib/cron/nightly-runner";

import { GET as adSpendGoogle } from "@/app/api/cron/ad-spend-sync/google/route";
import { GET as adSpendMeta } from "@/app/api/cron/ad-spend-sync/meta/route";
import { GET as googleConversions } from "@/app/api/cron/google-conversions/route";
import { GET as paymentReminders } from "@/app/api/cron/payment-reminders/route";
import { GET as recomputeTemperature } from "@/app/api/cron/recompute-temperature/route";
import { GET as retargetingGoogle } from "@/app/api/cron/retargeting-sync/google/route";
import { GET as retargetingMeta } from "@/app/api/cron/retargeting-sync/meta/route";
import { GET as slaSweep } from "@/app/api/cron/sla-sweep/route";
import { GET as whatsappBroadcastSweep } from "@/app/api/cron/whatsapp-broadcast-sweep/route";
import { GET as whatsappFlows } from "@/app/api/cron/whatsapp-flows/route";

/**
 * Every scheduled job, and which tier it belongs to.
 *
 * ## Why there are three tiers and not one
 *
 * There was one: a single nightly run, because the hosting plan allows
 * one scheduled job a day. That is correct for most of this list and
 * badly wrong for three of them, and the difference is not how expensive
 * a job is — it is **what kind of thing the job is**:
 *
 *   **A queue being drained.** Nothing a broadcast or an automation
 *   sends leaves the building until a sweep picks it up. On one run a
 *   day, pressing Send at 2pm means the messages go at 10:00 tomorrow,
 *   and an automation triggered by a new enquiry says hello a day late.
 *   For these, the schedule *is* the feature. → every 10 minutes
 *
 *   **A number somebody reads during the day.** Ad spend and the
 *   retargeting audiences are pulled from and pushed to Meta and Google.
 *   Once a day means a marketer looking at ROAS after lunch is reading
 *   this morning's figure, and a lead who enquired at 9am is not in an
 *   audience until tomorrow. Hourly fixes both at 24 API calls a day,
 *   which is nothing. → hourly
 *
 *   **Something with a human on the other end, at a civilised hour.** A
 *   fee reminder is a *date*: sending it at 03:10 because that is when a
 *   sweep happened to fire is worse than sending it at ten in the
 *   morning. Temperature is a slow signal by construction — recomputing
 *   it hourly would churn every lead's record for no new information.
 *   Google's offline conversion upload is a daily batch by convention,
 *   and re-presenting the same conversions invites the platform's own
 *   dedupe rather than ours. → daily
 *
 * ## The daily tier runs everything
 *
 * Not just its own three. The frequent and hourly schedules live
 * *outside* the deployment — an external scheduler calling a URL — so
 * they can be absent, disabled, or quietly broken, and the daily run is
 * the one thing that ships with the app and has to work. With it as a
 * safety net, the worst case for any scheduler failure is the delay this
 * system had before any of this existed.
 */

function job(
  key: string,
  label: string,
  handler: (request: Request) => Promise<Response>,
  estimateMs: number,
  request: Request,
): NightlyJob {
  return {
    key,
    label,
    estimateMs,
    run: async () => expectOk(label, await handler(request)),
  };
}

/** Draining a queue. Ten minutes, and the order is who is waiting longest. */
export function frequentJobs(request: Request): NightlyJob[] {
  return [
    job("whatsapp-flows", "WhatsApp automations", whatsappFlows, 8000, request),
    job(
      "whatsapp-broadcast-sweep",
      "Scheduled broadcasts",
      whatsappBroadcastSweep,
      8000,
      request,
    ),
    // A local table scan that finishes in seconds, and idempotent by
    // construction: `sla_escalated_at_hours` is the floor that stops a
    // rung firing twice, so running it every ten minutes notifies nobody
    // twice. A breach found tomorrow is a lead already lost.
    job("sla-sweep", "Response-time sweep", slaSweep, 4000, request),
  ];
}

/** Numbers somebody reads during the day. Hourly. */
export function hourlyJobs(request: Request): NightlyJob[] {
  return [
    job("ad-spend-sync/meta", "Meta ad spend", adSpendMeta, 6000, request),
    job("ad-spend-sync/google", "Google ad spend", adSpendGoogle, 6000, request),
    // Diffed against what was last sent, so an hourly run that finds
    // nothing new costs one API call and changes nothing.
    job("retargeting-sync/meta", "Meta retargeting audience", retargetingMeta, 8000, request),
    job(
      "retargeting-sync/google",
      "Google retargeting audience",
      retargetingGoogle,
      8000,
      request,
    ),
  ];
}

/**
 * Everything, once a day.
 *
 * Ordered by how fast the value decays, not by what is cheapest: if the
 * run is short of time the last jobs are skipped rather than failed, and
 * tomorrow covers them.
 */
export function dailyJobs(request: Request): NightlyJob[] {
  return [
    // Its own three first — these are the ones only this tier runs.
    job("payment-reminders", "Fee reminders", paymentReminders, 4000, request),
    job(
      "recompute-temperature",
      "Temperature recalculation",
      recomputeTemperature,
      4000,
      request,
    ),
    job("google-conversions", "Google offline conversions", googleConversions, 6000, request),
    // Then the safety net: everything the other two tiers do, in case
    // neither of them is running.
    ...frequentJobs(request),
    ...hourlyJobs(request),
  ];
}
