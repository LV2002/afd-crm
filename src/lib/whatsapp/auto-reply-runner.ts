import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { whatsappAutoReplies, whatsappAutoReplyLog, whatsappMessages } from "@/lib/db/schema";
import { normalizePhone } from "@/lib/identity/normalize-phone";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { sendTextMessage } from "@/lib/integrations/whatsapp/client";

import { decideAutoReply, type AutoReplyConfig } from "./auto-reply";

/**
 * Called from the inbound webhook for a message that arrived on the API
 * number. Sends the greeting or away message if one is due and records it
 * on the thread. Swallows its own failures: an auto-reply must never stop
 * a message being recorded.
 */
export async function maybeAutoReply(input: { phone: string; leadId: string | null; counsellorId: string | null }): Promise<boolean> {
  try {
    const phone = normalizePhone(input.phone) ?? input.phone;
    const rows = await db.select().from(whatsappAutoReplies);
    if (!rows.some((r) => r.enabled)) return false;

    const inbound = await db
      .select({ at: whatsappMessages.occurredAt })
      .from(whatsappMessages)
      .where(and(eq(whatsappMessages.fromPhone, phone), eq(whatsappMessages.direction, "inbound"), sql`${whatsappMessages.numberId} is null`))
      .orderBy(desc(whatsappMessages.occurredAt))
      .limit(2);
    const log = await db
      .select({ kind: whatsappAutoReplyLog.kind, at: whatsappAutoReplyLog.sentAt })
      .from(whatsappAutoReplyLog)
      .where(eq(whatsappAutoReplyLog.phone, phone))
      .orderBy(desc(whatsappAutoReplyLog.sentAt))
      .limit(10);

    const lastOf = (kind: string) => log.find((l) => l.kind === kind)?.at ?? null;
    const chosen = decideAutoReply({
      now: new Date(),
      previousInboundAt: inbound[1]?.at ?? null,
      lastSent: { greeting: lastOf("greeting"), away: lastOf("away") },
      configs: rows as AutoReplyConfig[],
    });
    if (!chosen) return false;

    const { access_token: accessToken, phone_number_id: phoneNumberId } = await getIntegrationCredentials("whatsapp", ["access_token", "phone_number_id"]);
    if (!accessToken || !phoneNumberId) return false;

    const waMessageId = await sendTextMessage(phoneNumberId, accessToken, phone, chosen.message.trim());
    await db.insert(whatsappAutoReplyLog).values({ phone, kind: chosen.kind });
    await db.insert(whatsappMessages).values({
      leadId: input.leadId,
      counsellorId: input.counsellorId,
      direction: "outbound",
      waMessageId,
      fromPhone: phoneNumberId,
      toPhone: phone,
      messageType: "text",
      body: chosen.message.trim(),
      status: "sent",
    });
    return true;
  } catch {
    return false;
  }
}
