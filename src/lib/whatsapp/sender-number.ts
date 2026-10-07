import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { whatsappNumbers } from "@/lib/db/schema";

/**
 * The number a counsellor's own messages leave from.
 *
 * Leon's rule, and it is absolute: *"if the counsellor wants to send a
 * message it should go out from their number. Never from the API."*
 *
 * So a free-form reply is sent from the Coexistence number registered to
 * the person typing it — not from the thread's number, and not from the
 * institute's broadcast number. A student who has been talking to Simi
 * gets Simi's reply from Simi's number, whichever inbox she happened to
 * read the message in.
 *
 * The API number keeps the two things it is actually for: broadcasts and
 * approved templates, both of which are the institute speaking rather
 * than a person.
 *
 * ## Resolved here, never passed in
 *
 * The caller does not choose. If a number id came from the browser, a
 * counsellor could send as a colleague by editing one field, and every
 * message in the thread would carry the wrong person's name. The only
 * input is the session.
 */

export interface SenderNumber {
  id: string;
  phoneNumberId: string;
  label: string;
}

export async function senderNumberFor(userId: string): Promise<SenderNumber | null> {
  const [row] = await db
    .select({
      id: whatsappNumbers.id,
      phoneNumberId: whatsappNumbers.phoneNumberId,
      label: whatsappNumbers.label,
    })
    .from(whatsappNumbers)
    .where(
      and(
        eq(whatsappNumbers.counsellorId, userId),
        eq(whatsappNumbers.mode, "coexistence"),
        eq(whatsappNumbers.isActive, true),
        isNull(whatsappNumbers.deletedAt),
      ),
    );

  return row ?? null;
}

/**
 * What somebody is told when they have no number of their own.
 *
 * Deliberately not "WhatsApp isn't connected": it is, and the broadcast
 * number is working. What is missing is *their* number, which is an
 * admin's job to onboard, so the message says whose problem it is rather
 * than leaving them pressing Send again.
 */
export const NO_SENDER_NUMBER_MESSAGE =
  "You don't have a WhatsApp number of your own connected yet, and replies go out from the counsellor's own number rather than the institute's broadcast number. An admin connects it under Settings → Integrations → WhatsApp. Until then, message them from the WhatsApp Business app on your phone.";
