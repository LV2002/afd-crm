import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { webhookEvents } from "@/lib/db/schema";
import { resolveOrCreateLead } from "@/lib/identity/resolve-or-create-lead";
import { getIntegrationCredentials } from "@/lib/integrations/credentials";
import { fetchMetaLead } from "@/lib/integrations/meta/graph-client";
import { buildResolveLeadInput, mapMetaLeadFields } from "@/lib/integrations/meta/map-lead-fields";
import { verifyMetaSignature } from "@/lib/integrations/meta/verify-signature";

export const dynamic = "force-dynamic";

/**
 * Meta's webhook subscription handshake — sent once when the webhook URL
 * is registered/re-verified in Meta's App Dashboard, not on every lead.
 * `verify_token` is a value the admin sets in Settings → Integrations and
 * re-enters in Meta's dashboard when subscribing; whoever knows both
 * values controls the subscription, nothing more sensitive than that.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expectedToken = (await getIntegrationCredentials("meta", ["verify_token"])).verify_token;

  if (mode === "subscribe" && expectedToken && token === expectedToken) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

interface MetaLeadgenChange {
  field: string;
  value: {
    leadgen_id: string;
  };
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{ id?: string; time?: number; changes?: MetaLeadgenChange[] }>;
}

/**
 * CLAUDE.md non-negotiable #9: verify → persist → process, in that order,
 * every time — never catch-and-200 (that's exactly what made v1's webhook
 * failures invisible). A malformed/forged request still gets ONE
 * `webhook_events` row logged before being rejected; a genuine, signed
 * delivery gets one row per `leadgen_id` it carries (a single POST can
 * batch more than one), each independently idempotent via
 * `webhook_events`' own `UNIQUE(source, external_id)` — Meta retries on
 * any non-2xx, and a retry must not create a second lead for a
 * `leadgen_id` already processed.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-hub-signature-256");

  const { app_secret: appSecret, page_access_token: pageAccessToken } = await getIntegrationCredentials("meta", [
    "app_secret",
    "page_access_token",
  ]);

  const signatureOk = Boolean(appSecret) && verifyMetaSignature(rawBody, signatureHeader, appSecret ?? "");

  let payload: MetaWebhookPayload | null = null;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    payload = null;
  }

  if (!signatureOk || !payload) {
    // Logged for forensics (CLAUDE.md non-negotiable #9's "persist before
    // processing" applies even to a rejected request), not processed.
    await db.insert(webhookEvents).values({
      source: "meta_leads",
      externalId: `invalid:${randomUUID()}`,
      signatureOk,
      raw: (payload as unknown as Record<string, unknown>) ?? { unparsedBodyPreview: rawBody.slice(0, 2000) },
      status: "failed",
      lastError: !signatureOk ? "Invalid or missing X-Hub-Signature-256" : "Body was not valid JSON",
    });
    return NextResponse.json({ error: "Invalid request" }, { status: signatureOk ? 400 : 401 });
  }

  const leadgenIds = (payload.entry ?? [])
    .flatMap((entry) => entry.changes ?? [])
    .filter((change) => change.field === "leadgen")
    .map((change) => change.value.leadgen_id)
    .filter(Boolean);

  if (leadgenIds.length === 0) {
    // A real, correctly-signed Meta callback that isn't a leadgen event
    // (e.g. a page subscription ping) — nothing to process, nothing to
    // fail on. Still 200s so Meta doesn't keep retrying a no-op.
    return NextResponse.json({ ok: true, processed: 0 });
  }

  let allOk = true;

  for (const leadgenId of leadgenIds) {
    const [inserted] = await db
      .insert(webhookEvents)
      .values({ source: "meta_leads", externalId: leadgenId, signatureOk: true, raw: payload as Record<string, unknown> })
      .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.externalId] })
      .returning({ id: webhookEvents.id });

    if (!inserted) continue; // already processed on a previous delivery of this same leadgen_id

    try {
      if (!pageAccessToken) {
        throw new Error("No Meta page access token configured (Settings → Integrations → Meta)");
      }

      const lead = await fetchMetaLead(leadgenId, pageAccessToken);
      const mapped = mapMetaLeadFields(lead);
      if (!mapped) {
        throw new Error(`Lead ${leadgenId} has no usable name/phone in its field_data`);
      }

      await resolveOrCreateLead(buildResolveLeadInput(lead, mapped));

      await db
        .update(webhookEvents)
        .set({ status: "done", processedAt: new Date(), attempts: sql`${webhookEvents.attempts} + 1` })
        .where(eq(webhookEvents.id, inserted.id));
    } catch (err) {
      allOk = false;
      await db
        .update(webhookEvents)
        .set({
          status: "failed",
          attempts: sql`${webhookEvents.attempts} + 1`,
          lastError: err instanceof Error ? err.message : String(err),
        })
        .where(eq(webhookEvents.id, inserted.id));
    }
  }

  // Non-2xx on genuine failure so Meta retries — the entries that already
  // succeeded are safe to see again (onConflictDoNothing skips them), so
  // a retry only ever re-attempts the ones that actually failed.
  return NextResponse.json({ ok: allOk, processed: leadgenIds.length }, { status: allOk ? 200 : 500 });
}
