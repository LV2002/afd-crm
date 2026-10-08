import { randomUUID } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { customWebhooks, webhookEvents } from "@/lib/db/schema";
import { adIdentifiersFrom } from "@/lib/integrations/form-payload/ad-identifiers";
import { authKeyMatches, presentedAuthKey } from "@/lib/integrations/custom-webhook/auth-key";
import { resolveOrCreateLead } from "@/lib/identity/resolve-or-create-lead";
import {
  mapFormPayload,
  submissionId,
  type ExtraAliases,
  type FormPayload,
} from "@/lib/integrations/form-payload/map-fields";
import { verifyMetaSignature } from "@/lib/integrations/meta/verify-signature";

export const dynamic = "force-dynamic";

/**
 * One handler for every endpoint an admin creates.
 *
 * Settings → Integrations → Custom webhooks makes a row with its own URL
 * token, its own signing secret and its own `source`; this route is what
 * that URL points at. A Knorish purchase feed, a Google Form, a Zapier
 * step and a landing page nobody mentioned all arrive here and become
 * leads attributed to whatever the admin called them.
 *
 * The point is that adding a source stops being a deploy. What it is NOT
 * is a second ingestion path: non-negotiable #8 still holds, so every
 * lead goes through `resolveOrCreateLead()`, which runs
 * `applyAssignment()` and never rejects a duplicate.
 *
 * ## Verification, in non-negotiable #9's order
 *
 * Check the signature against the raw body before parsing, persist the
 * payload whether or not it passed, then process.
 *
 * The signature is the same HMAC scheme as Meta's and the website form's,
 * reusing `verifyMetaSignature` rather than inventing a third one: the
 * sender signs the exact request body with the endpoint's secret and
 * sends `sha256=<hex>` in `X-AFD-Signature`.
 *
 * An endpoint may have `require_signature` off, for a sender that
 * physically cannot sign — a course platform whose integration screen
 * offers only a URL. Then the URL token is the only credential, which is
 * why it is 32 random bytes and never derived from the name. The Settings
 * screen says what that trade costs rather than offering it as a neutral
 * checkbox.
 *
 * Between those two there is now a third: an `auth_token`, a fixed key
 * the sender puts in a header. It is checked independently of the
 * signature, so an endpoint may require either, both or neither, and the
 * common case — a platform that cannot sign but can set one header — is
 * no longer forced down to an unauthenticated URL.
 *
 * ## Why an unknown token writes nothing
 *
 * A 404 with no `webhook_events` row. Recording unknown tokens would let
 * anybody with the URL shape fill that table — which holds raw payloads
 * and is read by admins — and a request to an endpoint that does not
 * exist is not a delivery that failed. It is not a delivery.
 */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const rawBody = await request.text();

  const [webhook] = await db
    .select()
    .from(customWebhooks)
    .where(
      and(eq(customWebhooks.slug, slug), eq(customWebhooks.isActive, true), isNull(customWebhooks.deletedAt)),
    );

  if (!webhook) {
    return NextResponse.json({ error: "Unknown endpoint" }, { status: 404 });
  }

  const signature = request.headers.get("x-afd-signature");
  const signatureOk = verifyMetaSignature(rawBody, signature, webhook.signingSecret);

  let payload: FormPayload | null = null;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    // A JSON array or a bare string is valid JSON and not a submission.
    payload =
      parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as FormPayload)
        : null;
  } catch {
    payload = null;
  }

  // Two separate refusals rather than one combined check: each needs a
  // different status code, a different message and — for the unparsable
  // one — a different thing stored, since there is no object to store.
  if (!payload) {
    await db.insert(webhookEvents).values({
      source: "custom",
      customWebhookId: webhook.id,
      externalId: `${webhook.id}:invalid:${randomUUID()}`,
      signatureOk,
      raw: { unparsedBodyPreview: rawBody.slice(0, 2000) },
      status: "failed",
      lastError: "Body was not a JSON object",
    });
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  if (webhook.requireSignature && !signatureOk) {
    await db.insert(webhookEvents).values({
      source: "custom",
      customWebhookId: webhook.id,
      externalId: `${webhook.id}:invalid:${randomUUID()}`,
      signatureOk: false,
      raw: payload,
      status: "failed",
      lastError: "Invalid or missing X-AFD-Signature",
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // The authentication key, when this endpoint has one. Recorded the same
  // way a bad signature is: a rejected delivery is the single most useful
  // thing on screen while somebody is setting a new sender up, and the
  // reason has to name the header so they know which box to look in.
  if (webhook.authToken && !authKeyMatches(webhook.authToken, presentedAuthKey(request.headers))) {
    await db.insert(webhookEvents).values({
      source: "custom",
      customWebhookId: webhook.id,
      externalId: `${webhook.id}:invalid:${randomUUID()}`,
      signatureOk,
      raw: payload,
      status: "failed",
      lastError: "Invalid or missing authentication key (Authorization: Bearer, or X-AFD-Key)",
    });
    return NextResponse.json({ error: "Invalid authentication key" }, { status: 401 });
  }

  // Prefixed with the endpoint's id: two feeds that both number their
  // submissions from 1 must not look like the same delivery.
  const externalId = `${webhook.id}:${submissionId(payload)}`;

  const [inserted] = await db
    .insert(webhookEvents)
    .values({
      source: "custom",
      customWebhookId: webhook.id,
      externalId,
      signatureOk,
      raw: payload,
    })
    .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.externalId] })
    .returning({ id: webhookEvents.id });

  // Already handled on an earlier delivery. Most senders retry on a
  // non-2xx, and a retried submission must not become a second lead.
  if (!inserted) return NextResponse.json({ ok: true, duplicate: true });

  const mapped = mapFormPayload(payload, (webhook.fieldAliases ?? undefined) as ExtraAliases | undefined);

  if (!mapped.ok) {
    // A 200, deliberately. The payload is unusable — no name, or no
    // usable phone — and retrying it produces exactly the same result, so
    // asking the sender to send it again helps nobody. It is recorded as
    // failed with the reason, and the reason names the fields that DID
    // arrive, which is what somebody setting up a new feed needs to read.
    await db
      .update(webhookEvents)
      .set({ status: "failed", attempts: sql`${webhookEvents.attempts} + 1`, lastError: mapped.reason })
      .where(eq(webhookEvents.id, inserted.id));
    return NextResponse.json({ ok: false, error: mapped.reason });
  }

  try {
    await resolveOrCreateLead({
      studentName: mapped.lead.studentName,
      primaryPhone: mapped.lead.primaryPhone,
      email: mapped.lead.email,
      city: mapped.lead.city,
      examYear: mapped.lead.examYear,
      interestedExams: mapped.lead.interestedExams,
      coursesInterested: mapped.lead.coursesInterested,
      // The whole point of the feature: the admin's own source name, so
      // the sources report can tell these apart.
      source: webhook.source,
      // Whatever the sender called the form, when it said; otherwise the
      // fixed sub-source from the endpoint's settings.
      subSource: mapped.lead.formName ?? webhook.subSource,
      centerId: webhook.centerId,
      utm: mapped.lead.utm,
      gclid: mapped.lead.utm?.gclid ?? null,
      fbclid: mapped.lead.utm?.fbclid ?? null,
      // Same reason as the website webhook: without a campaign id the
      // leads an ad produced cannot be shown against what it cost.
      ...adIdentifiersFrom(mapped.lead.utm),
      raw: mapped.lead.raw,
      dedupeKey: externalId,
    });

    await db
      .update(webhookEvents)
      .set({ status: "done", processedAt: new Date(), attempts: sql`${webhookEvents.attempts} + 1` })
      .where(eq(webhookEvents.id, inserted.id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    // A genuine failure — the database was unreachable, or something
    // unexpected threw. Non-2xx so the sender retries, per
    // non-negotiable #9. V1 returned 200 on everything and lost leads
    // invisibly.
    await db
      .update(webhookEvents)
      .set({
        status: "failed",
        attempts: sql`${webhookEvents.attempts} + 1`,
        lastError: error instanceof Error ? error.message : String(error),
      })
      .where(eq(webhookEvents.id, inserted.id));

    return NextResponse.json({ error: "Could not record the enquiry" }, { status: 500 });
  }
}

/**
 * A GET that says whether the endpoint is live.
 *
 * Several form builders and course platforms verify a URL before they
 * will save it, and some only offer a browser to test with. This answers
 * them without revealing anything: the token is already in the URL the
 * caller used, and the reply says only that something is listening and
 * whether it expects a signature.
 */
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;

  const [webhook] = await db
    .select({
      name: customWebhooks.name,
      requireSignature: customWebhooks.requireSignature,
      authToken: customWebhooks.authToken,
    })
    .from(customWebhooks)
    .where(
      and(eq(customWebhooks.slug, slug), eq(customWebhooks.isActive, true), isNull(customWebhooks.deletedAt)),
    );

  if (!webhook) return NextResponse.json({ error: "Unknown endpoint" }, { status: 404 });

  // Never the key itself, only whether one is wanted. This reply is
  // reachable by anybody holding the URL, which for an unsigned endpoint
  // is precisely the population the key exists to keep out.
  const expects = [
    "JSON body",
    webhook.requireSignature ? "signed with X-AFD-Signature" : null,
    webhook.authToken ? "an authentication key in Authorization or X-AFD-Key" : null,
  ].filter(Boolean);

  return NextResponse.json({
    ok: true,
    endpoint: webhook.name,
    method: "POST",
    expects: expects.join(", plus "),
  });
}
