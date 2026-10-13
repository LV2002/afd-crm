/**
 * What an endpoint's recent deliveries add up to, for the one line on its card.
 *
 * The card used to show the most recent FAILURE it could find as "Last error",
 * even when every delivery since had been accepted — so an endpoint taking leads
 * all day carried a red error from some setup attempt a week earlier, and the
 * only way to know whether it was current was to read the table. The summary
 * now says whether the NEWEST delivery was accepted, and keeps an older failure
 * as history rather than as a current fault.
 */
export interface DeliveryRowLike {
  custom_webhook_id: string | null;
  received_at: string;
  status: string;
  last_error: string | null;
}

export interface DeliverySummary {
  count: number;
  failed: number;
  /** ISO time of the newest delivery. */
  lastAt: string;
  lastFailed: boolean;
  /** The newest failure's reason, and when it happened. */
  lastError: string | null;
  lastErrorAt: string | null;
}

/** `rows` newest first, as the page reads them. */
export function summariseDeliveries(rows: readonly DeliveryRowLike[]): Map<string, DeliverySummary> {
  const summary = new Map<string, DeliverySummary>();
  for (const row of rows) {
    if (!row.custom_webhook_id) continue;
    const isFailure = row.status === "failed";
    const existing = summary.get(row.custom_webhook_id);
    if (!existing) {
      summary.set(row.custom_webhook_id, {
        count: 1,
        failed: isFailure ? 1 : 0,
        lastAt: row.received_at,
        lastFailed: isFailure,
        lastError: isFailure ? row.last_error : null,
        lastErrorAt: isFailure ? row.received_at : null,
      });
      continue;
    }
    existing.count += 1;
    if (isFailure) {
      existing.failed += 1;
      if (!existing.lastErrorAt) {
        existing.lastError = row.last_error;
        existing.lastErrorAt = row.received_at;
      }
    }
  }
  return summary;
}
