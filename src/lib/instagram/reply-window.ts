/**
 * Meta's 24-hour rule, on its own and free of `server-only` so it can be
 * tested and used from either side.
 *
 * Instagram allows a free-form reply only within 24 hours of the
 * person's last message. After that the only way to answer is the
 * Instagram app itself. Enforced in three places for three different
 * reasons: the inbox disables the box so nobody types a reply that
 * cannot be sent, the server action refuses so a stale page cannot get
 * round it, and Meta refuses, which is the only one that is authoritative.
 */
export const INSTAGRAM_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinInstagramReplyWindow(
  lastInboundAt: string | Date | null,
  now: Date = new Date(),
): boolean {
  if (!lastInboundAt) return false;
  const at = lastInboundAt instanceof Date ? lastInboundAt.getTime() : new Date(lastInboundAt).getTime();
  if (Number.isNaN(at)) return false;
  return now.getTime() - at < INSTAGRAM_REPLY_WINDOW_MS;
}
