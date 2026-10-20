import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { whatsappNumbers } from "@/lib/db/schema";

export interface NumberValues {
  phoneNumberId: string;
  label: string;
  displayPhoneNumber: string | null;
  mode: "api" | "coexistence";
  counsellorId: string | null;
  createsLeads: boolean;
}

/**
 * Registers a number the CRM has no live row for.
 *
 * `whatsapp_numbers.phone_number_id` is unique across removed rows too —
 * nothing is hard-deleted — so registering an ID that was once removed
 * used to hit the index and throw a raw database error: the settings
 * screen then showed "This screen didn't load" for somebody who had only
 * deleted a number and added it back. A removed row for the same ID is
 * brought back instead, carrying the new details; the messages it brought
 * in were never deleted, so they are reunited with it.
 */
export async function insertOrReviveNumber(values: NumberValues): Promise<{ id: string; outcome: "created" | "revived" }> {
  const [removed] = await db
    .select({ id: whatsappNumbers.id })
    .from(whatsappNumbers)
    .where(and(eq(whatsappNumbers.phoneNumberId, values.phoneNumberId), isNotNull(whatsappNumbers.deletedAt)));

  if (removed) {
    await db
      .update(whatsappNumbers)
      .set({ ...values, deletedAt: null, isActive: true, updatedAt: new Date() })
      .where(eq(whatsappNumbers.id, removed.id));
    return { id: removed.id, outcome: "revived" };
  }

  const [created] = await db.insert(whatsappNumbers).values(values).returning({ id: whatsappNumbers.id });
  return { id: created.id, outcome: "created" };
}
