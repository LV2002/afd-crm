import { timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { webhookEvents } from "@/lib/db/schema";
import { resolveOrCreateLead } from "@/lib/identity/resolve-or-create-lead";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { buildResolveLeadInput, mapGoogleLeadFields, type GoogleLeadWebhookPayload } from "@/lib/integrations/google/map-lead-fields";

export const dynamic = "force-dynamic";

/**
 * Unlike Meta's `X-Hub-Signature-256` (an HMAC over the raw body, checked
 * before touching the JSON), Google's Lead Form webhook has no signature
 * header at all — the shared secret is a `google_key` field inside the
 * JSON body itself (an admin generates it and pastes it into both this
 * CRM's Settings screen and Google Ads' webhook setup dialog). So
 * verification can't happen "before parsing" the way CLAUDE.md non-
 * negotiable #9 phrases it for an HMAC scheme; the equivalent here is
 * "never trust the body until the key inside it is checked," which is
 * what this does — parse, then constant-time-compare the key, then
 * persist and process. See docs/DECISIONS.md.
 */
function googleKeyMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * CLAUDE.md non-negotiable #9: persist the raw payload before doing
 * anything with it, and return non-2xx on genuine failure so the platform
 * retries — Google retries a non-2xx/timeout up to 3 times over 24 hours.
 * Google's own docs say a lead "is not guaranteed to be delivered exactly
 * once," so `webhook_events`' `UNIQUE(source, external_id)` on `lead_id`
 * is load-bearing here, same as Meta's `leadgen_id`.
 *
 * A `is_test: true` payload (Google Ads' "Send test lead" button) is
 * persisted and marked done like any other delivery, but deliberately
 * never reaches `resolveOrCreateLead()` — otherwise every click of that
 * button in Google Ads UI would create a fake lead in the live pipeline.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  const { google_key: expectedKey } = await getIntegrationCredentials("google", ["google_key"]);

  let payload: GoogleLeadWebhookPayload | null = null;
  try {
    payload = JSON.parse(rawBody) as GoogleLeadWebhookPayload;
  } catch {
    payload = null;
  }

  const keyOk = Boolean(expectedKey) && payload != null && googleKeyMatches(payload.google_key, expectedKey ?? "");

  if (!keyOk || !payload) {
    await db.insert(webhookEvents).values({
      source: "google_leads",
      externalId: `invalid:${randomUUID()}`,
      signatureOk: false,
      raw: (payload as unknown as Record<string, unknown>) ?? { unparsedBodyPreview: rawBody.slice(0, 2000) },
      status: "failed",
      lastError: !payload ? "Body was not valid JSON" : "Invalid or missing google_key",
    });
    return NextResponse.json({ error: "Invalid request" }, { status: payload ? 401 : 400 });
  }

  if (!payload.lead_id) {
    return NextResponse.json({ error: "Missing lead_id" }, { status: 400 });
  }

  const [inserted] = await db
    .insert(webhookEvents)
    .values({ source: "google_leads", externalId: payload.lead_id, signatureOk: true, raw: payload as unknown as Record<string, unknown> })
    .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.externalId] })
    .returning({ id: webhookEvents.id });

  if (!inserted) {
    // Already processed on a previous delivery of this same lead_id.
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }

  if (payload.is_test) {
    await db
      .update(webhookEvents)
      .set({ status: "done", processedAt: new Date(), attempts: sql`${webhookEvents.attempts} + 1` })
      .where(eq(webhookEvents.id, inserted.id));
    return NextResponse.json({ ok: true, test: true });
  }

  try {
    const mapped = mapGoogleLeadFields(payload);
    if (!mapped) {
      throw new Error(`Lead ${payload.lead_id} has no usable name/phone in its user_column_data`);
    }

    await resolveOrCreateLead(buildResolveLeadInput(payload, mapped));

    await db
      .update(webhookEvents)
      .set({ status: "done", processedAt: new Date(), attempts: sql`${webhookEvents.attempts} + 1` })
      .where(eq(webhookEvents.id, inserted.id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({
        status: "failed",
        attempts: sql`${webhookEvents.attempts} + 1`,
        lastError: err instanceof Error ? err.message : String(err),
      })
      .where(eq(webhookEvents.id, inserted.id));

    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
