import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { whatsappBroadcastRecipients, whatsappBroadcasts } from "@/lib/db/schema";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { normalizePhone } from "@/lib/identity/normalize-phone";
import { suppressedAmong } from "@/lib/whatsapp/opt-out";
import { sendTemplateMessage } from "@/lib/integrations/whatsapp/client";

export const dynamic = "force-dynamic";

// One run's worth of sends — small enough to comfortably finish inside a
// serverless function's request timeout, generous relative to AFD's real
// volume (a tag rarely spans more than a few dozen leads). Repeated
// hourly runs drain a larger broadcast over a few hours rather than one
// run trying to send everything at once.
const BATCH_SIZE = 50;

/**
 * Sends the next batch of queued broadcast recipients — never
 * synchronously from the create-broadcast action (see that action's own
 * comment). Runs on the direct db client, same trust boundary as every
 * other cron in this codebase.
 *
 * Sends each recipient from THEIR OWN LEAD'S assigned counsellor's
 * WhatsApp number, not a separate "marketing" number — keeps the
 * broadcast inside the customer's existing thread with the person they
 * actually know, consistent with the "one number per counsellor" model
 * (no separate marketing-number credential exists, by design). A lead
 * with no assigned counsellor, or whose counsellor has no number
 * configured, fails that one recipient with a clear reason rather than
 * silently skipping it forever.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { access_token: accessToken, phone_number_id: phoneNumberId } =
    await getIntegrationCredentials("whatsapp", ["access_token", "phone_number_id"]);
  if (!accessToken) {
    return NextResponse.json({ error: "WhatsApp access_token not configured" }, { status: 200 });
  }

  const rows = await db
    .select({
      recipientId: whatsappBroadcastRecipients.id,
      broadcastId: whatsappBroadcastRecipients.broadcastId,
      phone: whatsappBroadcastRecipients.phone,
      templateName: whatsappBroadcasts.templateName,
      templateLanguage: whatsappBroadcasts.templateLanguage,
      bodyParam: whatsappBroadcasts.bodyParam,
    })
    .from(whatsappBroadcastRecipients)
    .innerJoin(whatsappBroadcasts, eq(whatsappBroadcasts.id, whatsappBroadcastRecipients.broadcastId))
    // No join to `leads` any more: an audience can be students, and the
    // number to send to was snapshotted onto the recipient row when the
    // broadcast was composed. Joining would have quietly dropped every
    // student recipient.
    .where(and(eq(whatsappBroadcastRecipients.status, "queued"), eq(whatsappBroadcasts.status, "sending")))
    .limit(BATCH_SIZE);

  let sent = 0;
  let failed = 0;
  let suppressedCount = 0;
  const touchedBroadcastIds = new Set<string>();

  // Re-checked here, not only when the broadcast was composed. Somebody
  // can send STOP between a campaign being queued and this batch going
  // out, and "we had already decided to message them" is not a defence
  // anyone would accept.
  const suppressed = await suppressedAmong(db, rows.map((row) => row.phone));

  for (const row of rows) {
    touchedBroadcastIds.add(row.broadcastId);
    try {
      if (suppressed.has(normalizePhone(row.phone) ?? row.phone)) {
        // Not a failure — nothing went wrong, we simply must not send.
        // Marked failed with a plain reason so the broadcast can finish
        // and the count on screen explains itself.
        await db
          .update(whatsappBroadcastRecipients)
          .set({ status: "failed", errorMessage: "Opted out of WhatsApp messages." })
          .where(eq(whatsappBroadcastRecipients.id, row.recipientId));
        await db
          .update(whatsappBroadcasts)
          .set({ failedCount: sql`${whatsappBroadcasts.failedCount} + 1` })
          .where(eq(whatsappBroadcasts.id, row.broadcastId));
        suppressedCount += 1;
        continue;
      }

      // One institute number, so a lead with no counsellor is no longer a
      // reason a broadcast can't reach them.
      if (!phoneNumberId) throw new Error("No WhatsApp number is connected — see Settings → Integrations → WhatsApp.");

      const waMessageId = await sendTemplateMessage(
        phoneNumberId,
        accessToken,
        row.phone,
        row.templateName,
        row.templateLanguage,
        row.bodyParam ? [row.bodyParam] : undefined,
      );

      await db
        .update(whatsappBroadcastRecipients)
        .set({ status: "sent", waMessageId, sentAt: new Date() })
        .where(eq(whatsappBroadcastRecipients.id, row.recipientId));
      await db
        .update(whatsappBroadcasts)
        .set({ sentCount: sql`${whatsappBroadcasts.sentCount} + 1` })
        .where(eq(whatsappBroadcasts.id, row.broadcastId));
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(whatsappBroadcastRecipients)
        .set({ status: "failed", errorMessage: message })
        .where(eq(whatsappBroadcastRecipients.id, row.recipientId));
      await db
        .update(whatsappBroadcasts)
        .set({ failedCount: sql`${whatsappBroadcasts.failedCount} + 1` })
        .where(eq(whatsappBroadcasts.id, row.broadcastId));
      failed++;
    }
  }

  for (const broadcastId of touchedBroadcastIds) {
    const [remaining] = await db
      .select({ count: sql<number>`count(*)` })
      .from(whatsappBroadcastRecipients)
      .where(and(eq(whatsappBroadcastRecipients.broadcastId, broadcastId), eq(whatsappBroadcastRecipients.status, "queued")));
    if (Number(remaining.count) === 0) {
      await db
        .update(whatsappBroadcasts)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(whatsappBroadcasts.id, broadcastId));
    }
  }

  return NextResponse.json({ processed: rows.length, sent, failed, suppressed: suppressedCount });
}
