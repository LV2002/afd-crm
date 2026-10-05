/**
 * Reading the three webhook fields a Coexistence number sends.
 *
 * Coexistence is the WhatsApp Business app on somebody's phone AND the
 * Cloud API on the same number at the same time. Meta shipped it in May
 * 2025, and it is the answer to the thing this CRM has been working
 * around since Phase 5: AFD's real enquiries arrive on the counsellors'
 * own phones and were being typed in by hand.
 *
 * Three extra fields arrive for such a number, on the same endpoint as
 * everything else:
 *
 * - **`smb_message_echoes`** — what the counsellor just sent from the
 *   phone. `value.message_echoes[]`, each the same shape as an inbound
 *   message but with `from` the business and `to` the customer.
 * - **`history`** — up to 180 days of past conversations, delivered in
 *   chunks over the minutes after onboarding. `value.history[]`, each
 *   with `metadata.phase` / `metadata.chunk_order` / `metadata.progress`
 *   and `threads[]` of `messages[]`.
 * - **`smb_app_state_sync`** — the phone's address book. Deliberately not
 *   turned into anything; see `describeContactSync()`.
 *
 * Pure. The webhook handler does the database work; what is worth
 * testing without a database is which direction a message went, which
 * phone belongs to the customer, and when the backfill is finished.
 */

export interface EchoMessage {
  id: string;
  from: string;
  to: string;
  timestamp: string;
  type?: string;
  [content: string]: unknown;
}

export interface HistoryMessage extends EchoMessage {
  history_context?: { status?: string };
}

export interface HistoryMetadata {
  /** 0 = day 0–1, 1 = day 1–90, 2 = day 90–180. */
  phase?: number;
  chunk_order?: number;
  progress?: number;
}

export interface HistoryEntry {
  metadata?: HistoryMetadata;
  threads?: Array<{ id?: string; messages?: HistoryMessage[] }>;
}

export interface CoexistenceValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  message_echoes?: EchoMessage[];
  history?: HistoryEntry[];
  /** Only the count is read; the shape is whatever the sender sent. */
  contacts?: unknown[];
}

export type MessageDirection = "inbound" | "outbound";

export interface NormalisedMessage {
  waMessageId: string;
  direction: MessageDirection;
  /** The person at the other end — the lead, whichever way the message went. */
  customerPhone: string;
  businessPhone: string;
  occurredAt: Date;
  type: string;
}

/**
 * Which way a message went, and which end of it is the customer.
 *
 * The business number is the one Meta names in `metadata`, and it is the
 * only reliable way to tell: a history backfill carries both directions
 * in the same array, and an echo and an inbound message are the same
 * shape. Comparing against the display number alone is not enough —
 * Meta writes it without a `+` in some places and with one in others, so
 * the comparison is on digits.
 */
export function normaliseMessage(
  message: EchoMessage,
  businessDisplayPhone: string | null | undefined,
): NormalisedMessage | null {
  if (!message?.id || !message.from || !message.to) return null;

  const business = digits(businessDisplayPhone);
  const from = digits(message.from);
  const to = digits(message.to);

  // When Meta has not told us the business number — which happens on a
  // history chunk with no metadata — fall back to `history_context`
  // being absent on neither side and treat `from === to` as unusable
  // rather than guessing a direction.
  if (!business) return null;
  if (from === to) return null;

  const direction: MessageDirection = from === business ? "outbound" : "inbound";

  const seconds = Number(message.timestamp);
  return {
    waMessageId: message.id,
    direction,
    customerPhone: direction === "outbound" ? message.to : message.from,
    businessPhone: direction === "outbound" ? message.from : message.to,
    // A timestamp Meta sends in seconds. A history chunk from six months
    // ago must keep its own date, not arrive as "today" — the whole
    // point of the backfill is that the conversation reads in order.
    occurredAt: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date(),
    type: typeof message.type === "string" ? message.type : "text",
  };
}

/** Digits only, so `+91 98470 12345` and `919847012345` compare equal. */
function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Every message in a history delivery, flattened out of its threads.
 *
 * Threads are a grouping Meta applies; this CRM already groups by lead,
 * so the thread ids are not kept. What is kept is every message, in the
 * order Meta sent them.
 */
export function historyMessages(entries: HistoryEntry[] | undefined): HistoryMessage[] {
  const out: HistoryMessage[] = [];
  for (const entry of entries ?? []) {
    for (const thread of entry.threads ?? []) {
      for (const message of thread.messages ?? []) out.push(message);
    }
  }
  return out;
}

/**
 * Whether the backfill has finished.
 *
 * Meta sends history in three phases — day 0–1, day 1–90, day 90–180 —
 * in numbered chunks, with a `progress` percentage. Finished means the
 * last phase reported 100. Anything less is still arriving, and saying
 * "history synced" at that point would have somebody conclude that six
 * months of conversations simply were not there.
 */
export function historyIsComplete(entries: HistoryEntry[] | undefined): boolean {
  let sawFinalPhase = false;
  for (const entry of entries ?? []) {
    const phase = entry.metadata?.phase;
    const progress = entry.metadata?.progress;
    if (phase === 2 && progress === 100) sawFinalPhase = true;
  }
  return sawFinalPhase;
}

/**
 * What to do with the phone's address book: nothing.
 *
 * `smb_app_state_sync` carries the business customer's contacts, with an
 * add/update/delete action on each. It is tempting to turn them into
 * leads, and it would be wrong: a counsellor's phone holds their dentist,
 * their landlord and four hundred people who are not prospective
 * students. Importing them would fill the pipeline with names nobody
 * enquired, put every one of them on somebody's follow-up queue, and
 * quietly move personal contacts into a system the whole centre can read.
 *
 * The payload is still persisted to `webhook_events` like every other
 * delivery, so the decision is reversible and the data was not thrown
 * away. This function exists to make the decision explicit rather than
 * leaving an unhandled field that looks like an oversight.
 */
export function describeContactSync(value: CoexistenceValue): string {
  const count = value.contacts?.length ?? 0;
  return `${count} contact${count === 1 ? "" : "s"} from the phone's address book, recorded and not imported as leads.`;
}
