import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { leads, whatsappMessages, whatsappNumbers } from "@/lib/db/schema";
import { normalizePhone } from "@/lib/identity/normalize-phone";
import {
  mapMessageContent,
  type WhatsAppInboundMessage,
} from "@/lib/integrations/whatsapp/map-inbound";
import {
  historyIsComplete,
  historyMessages,
  normaliseMessage,
  type CoexistenceValue,
  type EchoMessage,
} from "@/lib/integrations/whatsapp/coexistence";

export interface CoexistenceNumber {
  id: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  label: string;
  mode: "api" | "coexistence";
  counsellorId: string | null;
  createsLeads: boolean;
}

/**
 * Which of the institute's numbers a delivery arrived on.
 *
 * Null for a number nobody has registered, which is not an error: the
 * CRM worked with one implicit number for months and must keep working
 * for an institute that never opens the numbers screen. The caller falls
 * back to the old behaviour — match an existing lead, never create one —
 * which is the safe half of the two policies.
 */
export async function findNumber(phoneNumberId: string | undefined): Promise<CoexistenceNumber | null> {
  if (!phoneNumberId) return null;

  const [row] = await db
    .select({
      id: whatsappNumbers.id,
      phoneNumberId: whatsappNumbers.phoneNumberId,
      displayPhoneNumber: whatsappNumbers.displayPhoneNumber,
      label: whatsappNumbers.label,
      mode: whatsappNumbers.mode,
      counsellorId: whatsappNumbers.counsellorId,
      createsLeads: whatsappNumbers.createsLeads,
    })
    .from(whatsappNumbers)
    .where(
      and(
        eq(whatsappNumbers.phoneNumberId, phoneNumberId),
        eq(whatsappNumbers.isActive, true),
        isNull(whatsappNumbers.deletedAt),
      ),
    );

  return row ?? null;
}

export interface RecordedMessages {
  stored: number;
  skipped: number;
}

/**
 * Messages the counsellor sent from the WhatsApp Business app on their
 * own phone, and messages from the 180-day backfill.
 *
 * Both are the same job: a message that already happened, somewhere this
 * CRM was not, which has to appear in the right lead's thread facing the
 * right way.
 *
 * ## Why these never create a lead
 *
 * An inbound message on a coexistence number may create one — a stranger
 * asking about NIFT coaching is the highest-intent enquiry the institute
 * gets. These two do not, for different reasons.
 *
 * An **echo** is the counsellor messaging somebody. That is as likely to
 * be their colleague, a supplier or their mother as a prospective
 * student, and a CRM that invents a lead every time its owner sends a
 * WhatsApp message is unusable within a week.
 *
 * The **history backfill** is six months of everything, arriving in one
 * burst minutes after onboarding. Turning that into leads would create
 * hundreds of them at once, each landing on somebody's follow-up queue,
 * most of them not students. It attaches to the leads that already
 * exist, which is the part worth having: the conversation a counsellor
 * had in March now sits on the lead they created in March.
 */
export async function recordKnownMessages(
  messages: EchoMessage[],
  number: CoexistenceNumber,
  businessDisplayPhone: string | null | undefined,
): Promise<RecordedMessages> {
  let stored = 0;
  let skipped = 0;

  for (const raw of messages) {
    const message = normaliseMessage(raw, businessDisplayPhone ?? number.displayPhoneNumber);
    if (!message) {
      skipped += 1;
      continue;
    }

    const phone = normalizePhone(message.customerPhone);
    if (!phone) {
      skipped += 1;
      continue;
    }

    const [lead] = await db
      .select({ id: leads.id, assignedTo: leads.assignedTo })
      .from(leads)
      .where(and(eq(leads.primaryPhone, phone), isNull(leads.deletedAt)));

    if (!lead) {
      skipped += 1;
      continue;
    }

    // The id Meta gave the message is the idempotency key. A history
    // chunk can be re-delivered, and an echo of a message this CRM sent
    // itself arrives as well — both would otherwise duplicate the
    // thread.
    const [existing] = await db
      .select({ id: whatsappMessages.id })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.waMessageId, message.waMessageId));
    if (existing) {
      skipped += 1;
      continue;
    }

    // The same mapper the ordinary inbound path uses, so a photo, a
    // document and a button tap are stored identically however they
    // reached the CRM. A thread where the same kind of message reads two
    // different ways depending on which webhook carried it is worse than
    // one that is merely incomplete.
    const content = mapMessageContent(raw as unknown as WhatsAppInboundMessage);
    const businessPhone = normalizePhone(message.businessPhone) ?? message.businessPhone;

    await db.insert(whatsappMessages).values({
      leadId: lead.id,
      // The phone's owner, not whoever is signed in: nobody is signed in
      // when a webhook arrives, and the conversation belongs to them.
      counsellorId: number.counsellorId ?? lead.assignedTo,
      sentBy: message.direction === "outbound" ? number.counsellorId : null,
      direction: message.direction,
      waMessageId: message.waMessageId,
      fromPhone: message.direction === "outbound" ? businessPhone : phone,
      toPhone: message.direction === "outbound" ? phone : businessPhone,
      messageType: content.messageType,
      body: content.body,
      mediaId: content.mediaId,
      mediaMimeType: content.mediaMimeType,
      // Already delivered, by definition — it happened on the phone. A
      // "queued" row would sit in the outbox forever waiting for a
      // status callback that is never coming.
      status: message.direction === "outbound" ? "sent" : "received",
      occurredAt: message.occurredAt,
    });

    stored += 1;
  }

  return { stored, skipped };
}

/**
 * One chunk of the 180-day backfill.
 *
 * Returns a sentence for the delivery record, because somebody watching
 * Settings → Integrations wants to know whether six months of chats
 * actually arrived, and "done" on its own does not say.
 */
export async function handleHistory(
  value: CoexistenceValue,
  number: CoexistenceNumber,
): Promise<string> {
  const messages = historyMessages(value.history);
  const result = await recordKnownMessages(messages, number, value.metadata?.display_phone_number);

  await db
    .update(whatsappNumbers)
    .set({
      historyMessageCount: sql`${whatsappNumbers.historyMessageCount} + ${result.stored}`,
      ...(historyIsComplete(value.history) ? { historyCompletedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(whatsappNumbers.id, number.id));

  return (
    `History chunk: ${result.stored} message${result.stored === 1 ? "" : "s"} attached to existing leads, ` +
    `${result.skipped} skipped (no matching lead, or already recorded).`
  );
}
