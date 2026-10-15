/**
 * Where "N more →" on the dashboard goes.
 *
 * Each section of the "Your day" card is a bucket the queue builder computed
 * from several signals at once — an overdue task OR an overdue follow-up, a
 * lead nobody has ever logged a call on, a Hot lead with no next step OR an SLA
 * breach. None of that is a column the leads list can filter on, so a link
 * built from filters would show a DIFFERENT set from the one the card counted.
 *
 * Instead the link carries the bucket's name, and the leads page asks the
 * queue builder for the same bucket and shows exactly those leads. The
 * number on the card and the number on the list cannot disagree.
 */
export const QUEUE_KEYS = ["overdue", "due_today", "new", "at_risk"] as const;
export type QueueKey = (typeof QUEUE_KEYS)[number];

export const QUEUE_LABELS: Record<QueueKey, string> = {
  overdue: "Overdue",
  due_today: "Due today",
  new: "New",
  at_risk: "At risk",
};

export function parseQueueKey(value: string | undefined): QueueKey | null {
  return (QUEUE_KEYS as readonly string[]).includes(value ?? "") ? (value as QueueKey) : null;
}

/**
 * `forUserId` is whose queue it is. Left out for your own; given when a
 * manager is looking at a counsellor's dashboard, so the list is that
 * counsellor's leads and not the manager's.
 */
export function queueHref(key: QueueKey, forUserId?: string | null): string {
  const params = new URLSearchParams({ queue: key });
  if (forUserId) params.set("for", forUserId);
  return `/leads?${params.toString()}`;
}

/** One temperature's leads — optionally one counsellor's. */
export function temperatureHref(temperature: string, forUserId?: string | null): string {
  const params = new URLSearchParams({ f_temperature: temperature });
  if (forUserId) params.set("f_assigned_to", forUserId);
  return `/leads?${params.toString()}`;
}
