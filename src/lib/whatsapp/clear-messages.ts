import { count, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { whatsappMessages } from "@/lib/db/schema";

/** How many WhatsApp messages are currently visible, on any number. */
export async function countLiveWhatsAppMessages(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(whatsappMessages)
    .where(isNull(whatsappMessages.deletedAt));
  return Number(row?.n ?? 0);
}

/**
 * Hides every WhatsApp message, on every number, from the inbox and from
 * every lead's page. Soft, like everything else: `deleted_at` is set, the
 * rows stay, and an administrator can bring them back.
 *
 * Meant for starting a number over after a setup that left test messages
 * behind, so it deliberately does not touch what is sent from here on —
 * only rows that exist now.
 */
export async function clearAllWhatsAppMessages(): Promise<number> {
  const result = await db
    .update(whatsappMessages)
    .set({ deletedAt: sql`now()` })
    .where(isNull(whatsappMessages.deletedAt))
    .returning({ id: whatsappMessages.id });
  return result.length;
}
