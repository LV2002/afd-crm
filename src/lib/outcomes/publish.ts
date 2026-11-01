import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  centers,
  dropdownOptions,
  enrolments,
  leads,
  outcomeEvents,
  temperatureHistory,
} from "@/lib/db/schema";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";

import {
  MAX_EVENTS_PER_REQUEST,
  buildRequestBody,
  formatEventAt,
  isValidSubmissionId,
  outcomeStatusOfOption,
  parseReply,
  rejectedEventNumber,
  revenueInr,
  type OutcomeEventPayload,
} from "./protocol";

/**
 * Reports each lead's status changes back to the marketing sheet.
 *
 * Two steps, both safe to repeat:
 *
 * 1. **Queue.** Every `temperature_history` row of a lead that arrived
 *    through a website form becomes one `outcome_events` row. The history
 *    table is written by a database trigger on every path that changes a
 *    status, so nothing here has to be called from the places that do.
 * 2. **Send.** Pending rows go out in signed batches of up to 200. A
 *    failure leaves them pending for the next run; the receiver stores a
 *    repeated event once, so a retry after an unclear answer cannot
 *    double-count.
 */

/** Only changes this recent are queued, so switching this on never replays years. */
const LOOKBACK_DAYS = 14;
const QUEUE_BATCH = 500;
const MAX_ATTEMPTS = 20;
const NOTE_MAX = 200;

export async function getOutcomeCredentials(): Promise<{ execUrl: string | null; secret: string | null }> {
  const c = await getIntegrationCredentials("website", ["outcomes_exec_url", "outcomes_secret"]);
  return { execUrl: c.outcomes_exec_url, secret: c.outcomes_secret };
}

export async function queueOutcomes(now = new Date()): Promise<{ queued: number; setAside: number }> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);

  const changes = await db
    .select({
      historyId: temperatureHistory.id,
      leadId: temperatureHistory.leadId,
      from: temperatureHistory.fromTemperature,
      to: temperatureHistory.toTemperature,
      changedAt: temperatureHistory.changedAt,
      submissionId: leads.submissionId,
      centerId: leads.centerId,
    })
    .from(temperatureHistory)
    .innerJoin(leads, eq(leads.id, temperatureHistory.leadId))
    .leftJoin(outcomeEvents, eq(outcomeEvents.historyId, temperatureHistory.id))
    .where(
      and(
        isNotNull(leads.submissionId),
        isNull(outcomeEvents.id),
        gte(temperatureHistory.changedAt, since),
        lt(temperatureHistory.changedAt, sql`now() + interval '1 minute'`),
      ),
    )
    .orderBy(asc(temperatureHistory.changedAt))
    .limit(QUEUE_BATCH);
  if (changes.length === 0) return { queued: 0, setAside: 0 };

  const options = await db
    .select({ value: dropdownOptions.value, metadata: dropdownOptions.metadata })
    .from(dropdownOptions)
    .where(and(eq(dropdownOptions.category, "temperature"), isNull(dropdownOptions.deletedAt)));
  const statusOf = new Map(options.map((o) => [o.value, outcomeStatusOfOption(o.metadata)]));

  // The admission's fee and course, for the rows that need them.
  const wonLeadIds = [
    ...new Set(changes.filter((c) => c.to && statusOf.get(c.to) === "admitted").map((c) => c.leadId)),
  ];
  const admissions = new Map<string, { netFeePaise: number; course: string; centre: string | null }>();
  for (const leadId of wonLeadIds) {
    const [row] = await db
      .select({ netFeePaise: enrolments.netFeePaise, course: enrolments.course, centre: centers.name })
      .from(enrolments)
      .leftJoin(centers, eq(centers.id, enrolments.centerId))
      .where(and(eq(enrolments.leadId, leadId), isNull(enrolments.deletedAt)))
      .orderBy(desc(enrolments.createdAt))
      .limit(1);
    if (row) admissions.set(leadId, row);
  }

  let queued = 0;
  let setAside = 0;
  for (const change of changes) {
    const status = change.to ? (statusOf.get(change.to) ?? null) : null;
    const before = change.from ? (statusOf.get(change.from) ?? null) : null;
    const submissionId = change.submissionId as string;

    let skippedReason: string | null = null;
    if (!isValidSubmissionId(submissionId)) skippedReason = "submission id is not one the sheet accepts";
    else if (!status) skippedReason = "this status is not an outcome";
    else if (status === before) skippedReason = "same outcome as the status before it";

    const admission = status === "admitted" ? admissions.get(change.leadId) : undefined;
    // Course and centre only: never a name or a number.
    const note = admission
      ? [admission.course, admission.centre].filter(Boolean).join(", ").slice(0, NOTE_MAX) || null
      : null;

    const inserted = await db
      .insert(outcomeEvents)
      .values({
        historyId: change.historyId,
        leadId: change.leadId,
        submissionId,
        status: status ?? "none",
        eventAt: change.changedAt,
        revenueInr: admission ? (revenueInr(admission.netFeePaise) ?? null) : null,
        note,
        skippedReason,
      })
      .onConflictDoNothing({ target: outcomeEvents.historyId })
      .returning({ id: outcomeEvents.id });
    if (inserted.length === 0) continue;
    if (skippedReason) setAside++;
    else queued++;
  }
  return { queued, setAside };
}

export interface SendResult {
  sent: number;
  added: number;
  duplicates: number;
  failed: number;
  error: string | null;
}

export async function sendPendingOutcomes(
  credentials: { execUrl: string; secret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const result: SendResult = { sent: 0, added: 0, duplicates: 0, failed: 0, error: null };

  // A few batches per run; more than that is a backlog for the next one.
  for (let batch = 0; batch < 5; batch++) {
    const pending = await db
      .select()
      .from(outcomeEvents)
      .where(
        and(
          isNull(outcomeEvents.sentAt),
          isNull(outcomeEvents.skippedReason),
          lt(outcomeEvents.attempts, MAX_ATTEMPTS),
        ),
      )
      .orderBy(asc(outcomeEvents.eventAt))
      .limit(MAX_EVENTS_PER_REQUEST);
    if (pending.length === 0) break;

    const events: OutcomeEventPayload[] = pending.map((row) => ({
      submission_id: row.submissionId,
      status: row.status,
      event_at: formatEventAt(row.eventAt),
      ...(row.status === "admitted" && row.revenueInr != null ? { revenue_inr: row.revenueInr } : {}),
      ...(row.note ? { note: row.note } : {}),
    }));

    let reply;
    try {
      const response = await fetchImpl(credentials.execUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: buildRequestBody(credentials.secret, events),
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
      });
      reply = parseReply(await response.text());
    } catch (error) {
      reply = { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }

    const ids = pending.map((p) => p.id);
    if (reply.ok) {
      await db
        .update(outcomeEvents)
        .set({ sentAt: sql`now()`, lastError: null, attempts: sql`${outcomeEvents.attempts} + 1` })
        .where(inArray(outcomeEvents.id, ids));
      result.sent += pending.length;
      result.added += reply.added;
      result.duplicates += reply.duplicates;
      continue;
    }

    result.error = reply.error;
    const badNumber = rejectedEventNumber(reply.error);
    const bad = badNumber && pending[badNumber - 1] ? pending[badNumber - 1] : null;
    if (bad) {
      // One event the sheet will never accept. Set it aside so the other
      // 199 are not held up by it, and retry the rest next run.
      await db
        .update(outcomeEvents)
        .set({ skippedReason: `refused by the sheet: ${reply.error}`.slice(0, 300) })
        .where(eq(outcomeEvents.id, bad.id));
      result.failed++;
    }
    const retry = ids.filter((id) => id !== bad?.id);
    if (retry.length > 0) {
      await db
        .update(outcomeEvents)
        .set({ lastError: reply.error.slice(0, 300), attempts: sql`${outcomeEvents.attempts} + 1` })
        .where(inArray(outcomeEvents.id, retry));
    }
    if (!bad) {
      result.failed += pending.length;
      break;
    }
  }
  return result;
}

export interface OutcomeStatus {
  configured: boolean;
  pending: number;
  sent: number;
  setAside: number;
  lastError: string | null;
}

/** Counts for the settings screen. Never the URL or the key. */
export async function getOutcomeStatus(): Promise<OutcomeStatus> {
  const { execUrl, secret } = await getOutcomeCredentials();
  const [counts] = await db
    .select({
      pending: sql<number>`count(*) filter (where sent_at is null and skipped_reason is null)::int`,
      sent: sql<number>`count(*) filter (where sent_at is not null)::int`,
      setAside: sql<number>`count(*) filter (where skipped_reason is not null)::int`,
    })
    .from(outcomeEvents);
  const [failing] = await db
    .select({ lastError: outcomeEvents.lastError })
    .from(outcomeEvents)
    .where(and(isNull(outcomeEvents.sentAt), isNotNull(outcomeEvents.lastError)))
    .limit(1);
  return {
    configured: Boolean(execUrl && secret),
    pending: counts?.pending ?? 0,
    sent: counts?.sent ?? 0,
    setAside: counts?.setAside ?? 0,
    lastError: failing?.lastError ?? null,
  };
}
