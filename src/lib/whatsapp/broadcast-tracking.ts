import "server-only";

import { and, eq, gte, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { whatsappBroadcastRecipients } from "@/lib/db/schema";
import { normalizePhone } from "@/lib/identity/normalize-phone";

/** A reply only counts toward a broadcast if it comes within this many days of the send. */
const REPLY_WINDOW_DAYS = 7;

/**
 * Meta told us a message's status. Record how far a broadcast message got.
 *
 * `read` implies `delivered` (Meta sometimes skips the delivered event).
 * Never throws into the webhook: a funnel is a report, not a reason to
 * make Meta retry.
 */
export async function applyBroadcastStatus(waMessageId: string, status: string): Promise<void> {
  try {
    if (status !== "delivered" && status !== "read") return;
    const now = new Date();
    await db
      .update(whatsappBroadcastRecipients)
      .set(
        status === "read"
          ? {
              readAt: now,
              deliveredAt: sql`coalesce(${whatsappBroadcastRecipients.deliveredAt}, ${now.toISOString()}::timestamptz)`,
              updatedAt: now,
            }
          : { deliveredAt: sql`coalesce(${whatsappBroadcastRecipients.deliveredAt}, ${now.toISOString()}::timestamptz)`, updatedAt: now },
      )
      .where(eq(whatsappBroadcastRecipients.waMessageId, waMessageId));
  } catch {
    /* reporting only */
  }
}

/** Somebody wrote in: mark them as having answered any recent broadcast. */
export async function markBroadcastReply(phone: string): Promise<void> {
  try {
    const normalised = normalizePhone(phone) ?? phone;
    const since = new Date(Date.now() - REPLY_WINDOW_DAYS * 86_400_000);
    await db
      .update(whatsappBroadcastRecipients)
      .set({ repliedAt: new Date() })
      .where(
        and(
          eq(whatsappBroadcastRecipients.phone, normalised),
          isNull(whatsappBroadcastRecipients.repliedAt),
          gte(whatsappBroadcastRecipients.sentAt, since),
        ),
      );
  } catch {
    /* reporting only */
  }
}
