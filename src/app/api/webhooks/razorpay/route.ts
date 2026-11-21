import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { leads, webhookEvents, whatsappPaymentLinks } from "@/lib/db/schema";
import { getIntegrationCredential } from "@/lib/integrations/credentials";
import { parsePaymentLinkEvent, statusForEvent, verifyRazorpaySignature } from "@/lib/integrations/razorpay/client";
import { notify } from "@/lib/notifications/notify";
import { formatINR } from "@/lib/format/currency";

export const dynamic = "force-dynamic";

/**
 * Razorpay payment-link events.
 *
 * Verify the signature, persist the raw event, then process (CLAUDE.md
 * non-negotiable #9). Processing only MARKS the link and tells accounts —
 * it never writes a payment or receipt: the ledger is append-only and the
 * person who records money recorded it themselves, against the right
 * enrolment, in the right account.
 *
 * A real failure answers 500 so Razorpay retries; an event we have no
 * interest in (or already handled) answers 200.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = await getIntegrationCredential("razorpay", "webhook_secret");
  const signatureOk = Boolean(secret) && verifyRazorpaySignature(rawBody, request.headers.get("x-razorpay-signature"), secret ?? "");

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = null;
  }

  if (!signatureOk || !payload) {
    await db.insert(webhookEvents).values({
      source: "razorpay",
      externalId: `invalid:${crypto.randomUUID()}`,
      signatureOk: false,
      raw: (payload as Record<string, unknown>) ?? { unparsedBodyPreview: rawBody.slice(0, 2000) },
      status: "failed",
      lastError: !signatureOk ? "Invalid or missing X-Razorpay-Signature" : "Body was not valid JSON",
    });
    return NextResponse.json({ error: "Invalid request" }, { status: signatureOk ? 400 : 401 });
  }

  const event = parsePaymentLinkEvent(payload);
  // Razorpay's own event id is the dedupe key when present.
  const eventId = request.headers.get("x-razorpay-event-id") ?? `${event?.event ?? "event"}:${event?.linkId ?? crypto.randomUUID()}`;
  const [inserted] = await db
    .insert(webhookEvents)
    .values({ source: "razorpay", externalId: eventId, signatureOk: true, raw: payload as Record<string, unknown> })
    .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.externalId] })
    .returning({ id: webhookEvents.id });
  if (!inserted) return NextResponse.json({ ok: true, duplicate: true });

  try {
    const status = event ? statusForEvent(event.event) : null;
    if (event && status && event.linkId) {
      const [link] = await db
        .update(whatsappPaymentLinks)
        .set({
          status,
          razorpayPaymentId: event.paymentId,
          paidAt: status === "paid" ? new Date() : null,
          updatedAt: new Date(),
        })
        // A paid link is final: a late "expired" must not undo it.
        .where(and(eq(whatsappPaymentLinks.razorpayLinkId, event.linkId), sql`${whatsappPaymentLinks.status} <> 'paid'`))
        .returning();
      if (link && status === "paid") {
        const [lead] = await db
          .select({ name: leads.studentName, number: leads.leadNumber, centerId: leads.centerId, owner: leads.assignedTo })
          .from(leads)
          .where(eq(leads.id, link.leadId));
        if (lead) {
          await notify({
            eventKey: "payment.link_paid",
            context: {
              lead_name: lead.name,
              lead_number: lead.number ?? "",
              amount: formatINR(link.amountPaise),
              description: link.description,
            },
            href: "/whatsapp/payments",
            entityType: "leads",
            entityId: link.leadId,
            centerId: lead.centerId,
            ownerId: lead.owner,
          });
        }
      }
    }
    await db.update(webhookEvents).set({ status: "done", processedAt: new Date(), attempts: sql`${webhookEvents.attempts} + 1` }).where(eq(webhookEvents.id, inserted.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({ status: "failed", attempts: sql`${webhookEvents.attempts} + 1`, lastError: err instanceof Error ? err.message : String(err) })
      .where(eq(webhookEvents.id, inserted.id));
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
