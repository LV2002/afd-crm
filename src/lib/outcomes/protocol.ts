import { createHmac } from "node:crypto";

import { kindOf, type TemperatureKind } from "@/lib/leads/temperature-kinds";

/**
 * The wire format for reporting outcomes to the marketing sheet's Apps
 * Script. Pure — no database, no network — so the exact bytes that get
 * signed can be tested against an independent HMAC.
 *
 * The receiver's rules are strict (ids, statuses, lengths, ten-minute
 * clock) and it answers with an error rather than guessing, so everything
 * it would refuse is checked here first and the event is set aside with a
 * reason instead of poisoning a batch of 200.
 */

export const MAX_EVENTS_PER_REQUEST = 200;
const MAX_REVENUE_INR = 10_000_000;

/** What the sheet counts as an outcome. Synonyms are accepted by it; we send the main names. */
export const OUTCOME_STATUSES = ["contacted", "demo_booked", "admitted", "lost"] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

const SUBMISSION_ID = /^[A-Za-z0-9_-]{1,80}$/;
const STATUS_NAME = /^[a-z_]{2,30}$/;

export function isValidSubmissionId(id: string | null | undefined): id is string {
  return typeof id === "string" && SUBMISSION_ID.test(id);
}

/**
 * The outcome a status stands for, from its *kind*, never its label (a
 * renamed "Took admission" must not change what is reported).
 *
 * - `new` is not an outcome: nobody has spoken to them.
 * - `open` and `parked` are `contacted`.
 * - `won` is `admitted`, `lost` is `lost`.
 *
 * An admin who adds a status that means something more specific (say "Demo
 * booked") sets `outcome_status` in that option's metadata and it is sent
 * as that, so this stays data rather than a code change.
 */
export function outcomeStatusFor(kind: TemperatureKind, metadata: unknown): string | null {
  const override =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>).outcome_status
      : undefined;
  if (typeof override === "string" && STATUS_NAME.test(override)) return override;

  switch (kind) {
    case "open":
    case "parked":
      return "contacted";
    case "won":
      return "admitted";
    case "lost":
      return "lost";
    case "new":
      return null;
  }
}

export function outcomeStatusOfOption(metadata: unknown): string | null {
  return outcomeStatusFor(kindOf(metadata), metadata);
}

export interface OutcomeEventPayload {
  submission_id: string;
  status: string;
  event_at: string;
  revenue_inr?: number;
  note?: string;
}

/** `2026-11-02T10:30:00+05:30` — the sheet wants the zone, and the institute runs on IST. */
export function formatEventAt(date: Date): string {
  const ist = new Date(date.getTime() + 330 * 60_000);
  return `${ist.toISOString().slice(0, 19)}+05:30`;
}

/** Whole rupees, or undefined when it does not fit the receiver's 0–10,000,000. */
export function revenueInr(paise: number | null | undefined): number | undefined {
  if (paise == null) return undefined;
  const rupees = Math.round(paise / 100);
  return rupees >= 0 && rupees <= MAX_REVENUE_INR ? rupees : undefined;
}

export function buildPayloadJson(events: OutcomeEventPayload[]): string {
  if (events.length < 1 || events.length > MAX_EVENTS_PER_REQUEST) {
    throw new Error(`A request carries 1 to ${MAX_EVENTS_PER_REQUEST} events, not ${events.length}.`);
  }
  return JSON.stringify({ version: 1, events });
}

/** Lowercase hex HMAC-SHA256 over `timestamp + "." + payloadJson`. */
export function signOutcome(secret: string, timestamp: number, payloadJson: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payloadJson}`).digest("hex");
}

export function buildRequestBody(secret: string, events: OutcomeEventPayload[], now = Date.now()): string {
  const payloadJson = buildPayloadJson(events);
  return JSON.stringify({
    _afd_publish: "outcome",
    timestamp: now,
    payloadJson,
    signature: signOutcome(secret, now, payloadJson),
  });
}

export type OutcomeReply = { ok: true; added: number; duplicates: number } | { ok: false; error: string };

export function parseReply(text: string): OutcomeReply {
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    if (body.ok === true) {
      return { ok: true, added: Number(body.added ?? 0), duplicates: Number(body.duplicates ?? 0) };
    }
    return { ok: false, error: typeof body.error === "string" ? body.error : "Refused without a reason." };
  } catch {
    return { ok: false, error: `Not a JSON answer (${text.slice(0, 120).replace(/\s+/g, " ")}).` };
  }
}

/** "an outcome is not valid (number 3)" → 3 (1-based), so only that event is set aside. */
export function rejectedEventNumber(error: string): number | null {
  const m = /number\s+(\d+)/i.exec(error);
  return m ? Number(m[1]) : null;
}
